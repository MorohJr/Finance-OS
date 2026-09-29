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
