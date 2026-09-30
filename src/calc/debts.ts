import type { Debt, Transaction } from '../domain/schemas';
import { addMonths, daysBetween, withDay } from './dates';
import { BP_SCALE, divRoundHalfUp, sumAgorot } from './money';
import { OVERDUE_GRACE_DAYS } from './loans';

/**
 * Non-loan debts (owner request 01/10/2026): original amount + added charges (fines, interest,
 * fees) − payments linked to the debt. Nothing is stored as a balance (iron rule 2).
 */

export interface DebtStatus {
  total: number;
  chargesTotal: number;
  paid: number;
  remaining: number;
  progressBp: number;
  isSettled: boolean;
  /** Arrangement: payments expected by today vs. paid; > 0 means behind. */
  behind: number;
  overdue: boolean;
  nextPayment?: { date: string; amount: number };
  paymentsLeft: number | null;
  payoffDate?: string;
}

type PaymentTx = Pick<Transaction, 'amountAgorot' | 'links' | 'deletedAt' | 'status' | 'kind'>;

/** Due dates of the arrangement: paymentDay each month from planStartDate. */
export function planDueDates(d: Pick<Debt, 'planStartDate' | 'paymentDay' | 'date'>, until: string): string[] {
  const start = d.planStartDate ?? d.date;
  const day = d.paymentDay ?? Number(start.slice(8, 10));
  let first = withDay(start, day);
  if (first < start) first = withDay(addMonths(start, 1), day);
  const out: string[] = [];
  for (let i = 0; i < 600; i++) {
    const due = withDay(addMonths(first, i, day), day);
    if (due > until) break;
    out.push(due);
  }
  return out;
}

export function debtStatus(d: Debt, payments: readonly PaymentTx[], today: string): DebtStatus {
  const chargesTotal = sumAgorot(d.charges.map((c) => c.amountAgorot));
  const total = d.originalAmountAgorot + chargesTotal;
  const paid = sumAgorot(payments.filter((t) => t.links?.debtId === d.id && !t.deletedAt && t.status === 'cleared' && t.kind === 'expense').map((t) => t.amountAgorot));
  const remaining = Math.max(0, total - paid);
  const isSettled = remaining === 0 || d.status === 'settled';

  let behind = 0;
  let nextPayment: DebtStatus['nextPayment'];
  let paymentsLeft: number | null = null;
  let payoffDate: string | undefined;
  const monthly = d.monthlyPaymentAgorot;
  if (monthly && !isSettled) {
    const due = planDueDates(d, today).filter((x) => daysBetween(x, today) > OVERDUE_GRACE_DAYS);
    behind = Math.max(0, Math.min(total, due.length * monthly) - paid);
    const upcoming = planDueDates(d, addMonths(today, 1)).find((x) => x >= today) ?? withDay(addMonths(today, 1), d.paymentDay ?? 1);
    nextPayment = { date: upcoming, amount: Math.min(monthly, remaining) };
    paymentsLeft = Math.ceil(remaining / monthly);
    payoffDate = addMonths(upcoming, paymentsLeft - 1, d.paymentDay);
  }
  return {
    total,
    chargesTotal,
    paid,
    remaining,
    progressBp: total > 0 ? Math.min(BP_SCALE, divRoundHalfUp(paid * BP_SCALE, total)) : BP_SCALE,
    isSettled,
    behind,
    overdue: behind > 0,
    nextPayment,
    paymentsLeft,
    payoffDate,
  };
}

/** Planned arrangement payments from today until the balance is covered (forecast, 10.9). */
export function debtSchedule(d: Debt, status: DebtStatus, until: string): { date: string; amount: number }[] {
  if (!d.monthlyPaymentAgorot || status.isSettled || !status.nextPayment) return [];
  const out: { date: string; amount: number }[] = [];
  let left = status.remaining;
  let date = status.nextPayment.date;
  while (left > 0 && date <= until && out.length < 600) {
    const amount = Math.min(d.monthlyPaymentAgorot, left);
    out.push({ date, amount });
    left -= amount;
    date = addMonths(date, 1, d.paymentDay);
  }
  return out;
}
