import { parseAmountToAgorot } from '../calc/money';
import { parseDisplayDate } from '../calc/dates';
import { normalizeText } from '../calc/transactionFilter';
import { excelSerialToIso } from './excelDate';
import type { Cell, Grid } from './read';
import type { Mapping, TargetField } from './mapping';

/** One row of a bank or card file, normalized (SPEC 9.2). */
export interface ParsedRow {
  line: number; // 1-based row number in the file, for the user
  date: string;
  chargeDate?: string;
  description: string;
  /** Money direction relative to the target: out = expense / purchase, in = income / refund. */
  flow: 'in' | 'out';
  amountAgorot: number; // > 0
  originalAmountAgorot?: number;
  installment?: { number: number; count: number };
  note?: string;
  cardLast4?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: { line: number; reason: 'date' | 'amount' }[];
  /** "סה"כ" lines, e.g. a card statement total, keyed by charge date if known. */
  totals: { line: number; amountAgorot: number; chargeDate?: string }[];
}

export type TargetKind = 'bank' | 'card';

function cellToDate(c: Cell): string | null {
  if (c === null) return null;
  if (typeof c === 'number') return c > 20000 && c < 80000 ? excelSerialToIso(c) : null;
  return parseDisplayDate(c.split(' ')[0]!);
}

/** Excel numbers are floats: convert once at the boundary, via a 2-decimal string (never float math on money after this). */
function cellToAgorot(c: Cell): number | null {
  if (c === null || c === '') return null;
  if (typeof c === 'number') return Number.isFinite(c) ? parseAmountToAgorot(c.toFixed(2)) : null;
  return parseAmountToAgorot(c);
}

const INSTALLMENT_RE = /תשלום\s*(\d+)\s*(?:מתוך|מ-|\/)\s*(\d+)/;

export function parseRows(grid: Grid, headerRow: number, headers: string[], mapping: Mapping, target: TargetKind): ParseResult {
  const col = (f: TargetField) => (mapping[f] ? headers.indexOf(mapping[f]!) : -1);
  const idx = Object.fromEntries((Object.keys(mapping) as TargetField[]).map((f) => [f, col(f)])) as Partial<Record<TargetField, number>>;
  const get = (row: Cell[], f: TargetField): Cell => (idx[f] !== undefined && idx[f]! >= 0 ? (row[idx[f]!] ?? null) : null);

  const out: ParseResult = { rows: [], errors: [], totals: [] };
  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const line = i + 1;
    const text = row.filter((c) => typeof c === 'string').join(' ');
    const date = cellToDate(get(row, 'transactionDate'));
    const chargeDate = cellToDate(get(row, 'chargeDate')) ?? undefined;

    // Amount and direction.
    let signed: number | null = null;
    const debit = cellToAgorot(get(row, 'debit'));
    const credit = cellToAgorot(get(row, 'credit'));
    const charge = cellToAgorot(get(row, 'chargeAmount'));
    const single = cellToAgorot(get(row, 'signedAmount'));
    if (debit || credit) signed = (credit ?? 0) - (debit ?? 0); // + = into the account
    else if (charge !== null) signed = target === 'card' ? -charge : charge;
    else if (single !== null) signed = target === 'card' ? -single : single;
    const original = cellToAgorot(get(row, 'originalAmount'));
    if (signed === null && original !== null) signed = target === 'card' ? -original : original;

    if (!date) {
      // Totals lines ("סה"כ לחיוב") have an amount but no transaction date.
      if (/סה"?כ|סה״כ|total/i.test(text) && signed !== null) out.totals.push({ line, amountAgorot: Math.abs(signed), chargeDate });
      else if (signed !== null && text) out.errors.push({ line, reason: 'date' });
      continue;
    }
    if (signed === null || signed === 0) {
      if (signed === null) out.errors.push({ line, reason: 'amount' });
      continue;
    }

    const description = String(get(row, 'description') ?? '').trim();
    const note = get(row, 'note') === null ? undefined : String(get(row, 'note')).trim();
    let installment: ParsedRow['installment'];
    const num = Number(get(row, 'installmentNumber'));
    const cnt = Number(get(row, 'installmentCount'));
    if (num > 0 && cnt > 1) installment = { number: num, count: cnt };
    else {
      const m = INSTALLMENT_RE.exec(`${note ?? ''} ${text}`);
      if (m) installment = { number: Number(m[1]), count: Number(m[2]) };
    }
    const last4 = String(get(row, 'cardLast4') ?? '').replace(/\D/g, '').slice(-4) || undefined;

    out.rows.push({
      line,
      date,
      chargeDate,
      description,
      flow: signed < 0 ? 'out' : 'in',
      amountAgorot: Math.abs(signed),
      originalAmountAgorot: original !== null ? Math.abs(original) : undefined,
      installment: installment && installment.count >= 2 && installment.number >= 1 && installment.number <= installment.count ? installment : undefined,
      note,
      cardLast4: last4,
    });
  }
  return out;
}

/** Normalized description for hashing and matching. */
export function normalizeDescription(s: string): string {
  return normalizeText(s).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
}
