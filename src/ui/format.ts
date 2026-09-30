import type { Transaction } from '../domain/schemas';
import { signedAmountFor } from '../calc/balance';

export type Tone = 'income' | 'expense' | 'transfer' | 'plain';

/**
 * How to show a transaction's amount. In an account's context: its signed effect on that account.
 * In the global list: income +, expense −, neutral kinds unsigned.
 */
export function displayAmount(t: Transaction, accountId?: string): { agorot: number; tone: Tone } {
  if (accountId) {
    const signed = signedAmountFor(t, accountId);
    const neutral = t.kind === 'transfer' || t.kind === 'opening_balance' || t.kind === 'adjustment' || t.kind === 'card_payment';
    return { agorot: signed, tone: neutral ? 'transfer' : signed >= 0 ? 'income' : 'expense' };
  }
  switch (t.kind) {
    case 'income':
    case 'refund':
    case 'loan_disbursement':
    case 'lending_repayment':
      return { agorot: t.amountAgorot, tone: 'income' };
    case 'expense':
    case 'loan_payment':
    case 'lending_out':
      return { agorot: -t.amountAgorot, tone: 'expense' };
    case 'opening_balance':
    case 'adjustment':
    case 'investment_trade':
      return { agorot: t.direction === 'out' ? -t.amountAgorot : t.amountAgorot, tone: 'transfer' };
    default:
      return { agorot: t.amountAgorot, tone: 'transfer' };
  }
}

/** Agorot → editable string "1234.56" (for form fields), without floats. */
export function agorotToInput(agorot: number | undefined): string {
  if (agorot === undefined) return '';
  const sign = agorot < 0 ? '-' : '';
  const abs = Math.abs(agorot);
  const cents = abs % 100;
  return `${sign}${Math.floor(abs / 100)}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`;
}

/** Basis points → editable percent string "4.45". */
export function bpToInput(bp: number | undefined): string {
  if (bp === undefined) return '';
  const frac = bp % 100;
  return `${Math.floor(bp / 100)}${frac ? `.${String(frac).padStart(2, '0').replace(/0$/, '')}` : ''}`;
}

/**
 * Live formatting of an amount field: "1234567.5" → "1,234,567.5" while typing.
 * Keeps at most 2 decimals and one leading minus (when allowed). Text only: parsing to agorot
 * still happens once, on submit (parseAmountToAgorot accepts the commas).
 */
export function formatAmountInput(raw: string, allowNegative = false): string {
  const negative = allowNegative && /^\s*[-−]/.test(raw);
  const cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  const intDigits = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, '');
  const frac = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = frac === null ? grouped : `${grouped || '0'}.${frac}`;
  return `${negative ? '-' : ''}${body}`;
}

/** Where the caret belongs after formatting: after the same number of digits/dots as before. */
export function caretAfterFormat(formatted: string, meaningfulBefore: number): number {
  if (meaningfulBefore <= 0) return formatted.startsWith('-') ? 1 : 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d.]/.test(formatted[i]!)) seen++;
    if (seen === meaningfulBefore) return i + 1;
  }
  return formatted.length;
}
