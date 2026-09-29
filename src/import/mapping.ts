import type { ImportPreset } from '../domain/schemas';
import { normalizeText } from '../calc/transactionFilter';
import type { Grid } from './read';

export type TargetField = keyof NonNullable<ImportPreset['mapping']> & string;
export type Mapping = Partial<Record<TargetField, string>>;

/** Header words seen in Israeli bank and card exports (SPEC 9.2). Exact matches win over "contains". */
const KEYWORDS: Record<TargetField, string[]> = {
  transactionDate: ['תאריך עסקה', 'תאריך העסקה', 'תאריך רכישה', 'תאריך פעולה', 'תאריך', 'date', 'transaction date'],
  chargeDate: ['תאריך חיוב', 'מועד חיוב', 'תאריך החיוב', 'billing date', 'charge date'],
  description: ['שם בית העסק', 'שם בית עסק', 'בית עסק', 'בית העסק', 'תיאור', 'תיאור הפעולה', 'תיאור פעולה', 'פרטים', 'הפעולה', 'description', 'merchant'],
  chargeAmount: ['סכום חיוב', 'סכום החיוב', 'סכום לחיוב', 'סכום חיוב ₪', 'charge amount'],
  originalAmount: ['סכום עסקה', 'סכום העסקה', 'סכום עסקה מקורי', 'סכום מקורי', 'transaction amount', 'original amount'],
  debit: ['חובה', 'בחובה', 'debit'],
  credit: ['זכות', 'בזכות', 'credit'],
  signedAmount: ['סכום', 'סכום ₪', 'amount', 'זכות/חובה', '₪ זכות/חובה'],
  installmentNumber: ['מספר תשלום', 'תשלום מספר', 'installment'],
  installmentCount: ['מתוך', 'מספר תשלומים', 'סה"כ תשלומים', 'כמות תשלומים'],
  note: ['הערות', 'הערה', 'פירוט נוסף', 'פרטים נוספים', 'notes', 'אסמכתא'],
  cardLast4: ['4 ספרות אחרונות', 'ספרות אחרונות', '4 ספרות אחרונות של כרטיס האשראי', 'כרטיס', 'מספר כרטיס'],
};

const DATE_FIELDS: TargetField[] = ['transactionDate', 'chargeDate'];
const AMOUNT_FIELDS: TargetField[] = ['chargeAmount', 'originalAmount', 'debit', 'credit', 'signedAmount'];

function score(header: string, field: TargetField): number {
  const h = normalizeText(header);
  if (!h) return 0;
  let best = 0;
  for (const k of KEYWORDS[field]) {
    const n = normalizeText(k);
    if (h === n) best = Math.max(best, 100 + n.length);
    else if (h.includes(n)) best = Math.max(best, n.length);
  }
  return best;
}

/** The header row: the first row (within the first 30) that has a date header and an amount header. */
export function findHeaderRow(grid: Grid): number {
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const cells = (grid[i] ?? []).map((c) => (typeof c === 'string' ? c : ''));
    const hasDate = cells.some((c) => DATE_FIELDS.some((f) => score(c, f) > 0));
    const hasAmount = cells.some((c) => AMOUNT_FIELDS.some((f) => score(c, f) > 0));
    if (hasDate && hasAmount) return i;
  }
  return -1;
}

export function headersOf(grid: Grid, headerRow: number): string[] {
  return (grid[headerRow] ?? []).map((c, i) => (c === null ? `עמודה ${i + 1}` : String(c)));
}

/** Guesses a mapping: each header goes to the field it matches best, each field gets one header. */
export function guessMapping(headers: string[]): Mapping {
  const candidates: { field: TargetField; header: string; s: number }[] = [];
  for (const header of headers) {
    for (const field of Object.keys(KEYWORDS) as TargetField[]) {
      const s = score(header, field);
      if (s > 0) candidates.push({ field, header, s });
    }
  }
  candidates.sort((a, b) => b.s - a.s);
  const mapping: Mapping = {};
  const usedHeaders = new Set<string>();
  for (const c of candidates) {
    if (mapping[c.field] || usedHeaders.has(c.header)) continue;
    mapping[c.field] = c.header;
    usedHeaders.add(c.header);
  }
  // A lone "סכום" next to specific amount columns is ambiguous; prefer the specific ones.
  if (mapping.signedAmount && (mapping.chargeAmount || (mapping.debit && mapping.credit))) delete mapping.signedAmount;
  return mapping;
}

/** Stable identity of a file layout, to recognize a saved preset (SPEC 9.2). */
export function headerSignature(headers: string[]): string[] {
  return headers.map((h) => normalizeText(h)).filter((h) => h && !/^עמודה \d+$/.test(h));
}

export function matchPreset<P extends Pick<ImportPreset, 'headerSignature' | 'deletedAt'>>(presets: readonly P[], headers: string[]): P | undefined {
  const sig = headerSignature(headers).join('|');
  return presets.find((p) => !p.deletedAt && p.headerSignature.join('|') === sig);
}
