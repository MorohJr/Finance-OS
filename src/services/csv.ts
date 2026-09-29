import type { Transaction } from '../domain/schemas';
import { formatDisplayDate } from '../calc/dates';

/**
 * CSV export of transactions for a date range, for the accountant (SPEC 12).
 * UTF-8 with BOM so Excel opens Hebrew correctly. Pure: names and labels are passed in.
 */

export interface CsvLookups {
  accountName: (id: string | undefined) => string;
  cardName: (id: string | undefined) => string;
  categoryName: (id: string | undefined) => string;
  payeeName: (id: string | undefined) => string;
  kindLabel: (kind: Transaction['kind'], direction: Transaction['direction']) => string;
  contextLabel: (c: Transaction['context']) => string;
  statusLabel: (s: Transaction['status']) => string;
  headers: readonly string[];
}

/** Agorot → "1234.56" without floats. */
export function agorotToDecimal(agorot: number): string {
  const sign = agorot < 0 ? '-' : '';
  const abs = Math.abs(agorot);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Quotes a cell, and neutralizes spreadsheet formulas in text (CSV injection). */
export function csvCell(value: string, isText = true): string {
  let v = value;
  if (isText && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function transactionsToCsv(txs: readonly Transaction[], l: CsvLookups): string {
  const rows = [l.headers.map((h) => csvCell(h)).join(',')];
  const sorted = [...txs].filter((t) => !t.deletedAt).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  for (const t of sorted) {
    const b = t.business;
    rows.push(
      [
        csvCell(formatDisplayDate(t.date), false),
        csvCell(l.kindLabel(t.kind, t.direction)),
        csvCell(agorotToDecimal(t.amountAgorot), false),
        csvCell(l.accountName(t.accountId)),
        csvCell(l.cardName(t.cardId)),
        csvCell(l.accountName(t.toAccountId)),
        csvCell(l.categoryName(t.categoryId)),
        csvCell(l.payeeName(t.payeeId)),
        csvCell(t.description ?? ''),
        csvCell(t.note ?? ''),
        csvCell(t.tags.join(' ')),
        csvCell(l.contextLabel(t.context)),
        csvCell(l.statusLabel(t.status)),
        csvCell(b ? agorotToDecimal(b.vatAgorot) : '', false),
        csvCell(b && 'netAgorot' in b ? agorotToDecimal(b.netAgorot) : '', false),
      ].join(','),
    );
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}
