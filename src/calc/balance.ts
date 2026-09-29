import type { Account, Transaction } from '../domain/schemas';
import { divRoundHalfUp, sumAgorot, BP_SCALE } from './money';

/**
 * Account balances (SPEC 10.1). A balance is ONLY the sum of transactions (iron rule 2).
 * Pure functions: callers pass the transactions, nothing is read from the DB here.
 */

type BalanceTx = Pick<Transaction, 'kind' | 'amountAgorot' | 'direction' | 'accountId' | 'toAccountId' | 'cardId' | 'status' | 'deletedAt' | 'date'>;

/** Effect of a transaction on its own account's balance, by kind (SPEC 6.3 table). */
function sourceSign(t: BalanceTx): 1 | -1 {
  switch (t.kind) {
    case 'income':
    case 'refund':
    case 'loan_disbursement':
    case 'lending_repayment':
      return 1;
    case 'expense':
    case 'transfer':
    case 'card_payment':
    case 'loan_payment':
    case 'lending_out':
      return -1;
    case 'opening_balance':
    case 'adjustment':
    case 'investment_trade':
      if (!t.direction) throw new Error(`${t.kind} without direction`);
      return t.direction === 'in' ? 1 : -1;
  }
}

/**
 * Signed amount of `t` as seen by account `accountId`. 0 if the transaction doesn't touch it.
 * Card purchases (cardId without accountId) don't touch a bank balance until the card is charged
 * (SPEC 5.7, via `card_payment`). A debit-card purchase carries accountId = the billing account (10.2).
 */
export function signedAmountFor(t: BalanceTx, accountId: string): number {
  let amount = 0;
  if (t.accountId === accountId) amount += sourceSign(t) * t.amountAgorot;
  if (t.kind === 'transfer' && t.toAccountId === accountId) amount += t.amountAgorot;
  return amount;
}

/** Counts toward the balance: cleared and not deleted. Pending only goes into forecasts. */
export function countsForBalance(t: Pick<Transaction, 'status' | 'deletedAt'>): boolean {
  return t.status === 'cleared' && !t.deletedAt;
}

export function accountBalance(accountId: string, txs: readonly BalanceTx[], upToDate?: string): number {
  return sumAgorot(
    txs.filter((t) => countsForBalance(t) && (!upToDate || t.date <= upToDate)).map((t) => signedAmountFor(t, accountId)),
  );
}

/** All balances in one pass. Accounts with no transactions are 0. */
export function balancesByAccount(accountIds: readonly string[], txs: readonly BalanceTx[]): Map<string, number> {
  const result = new Map<string, number>(accountIds.map((id) => [id, 0]));
  for (const t of txs) {
    if (!countsForBalance(t)) continue;
    if (t.accountId && result.has(t.accountId)) {
      result.set(t.accountId, result.get(t.accountId)! + sourceSign(t) * t.amountAgorot);
    }
    if (t.kind === 'transfer' && t.toAccountId && result.has(t.toAccountId)) {
      result.set(t.toAccountId, result.get(t.toAccountId)! + t.amountAgorot);
    }
  }
  return result;
}

/**
 * Daily closing balances for a chart: one point per day that has a transaction, starting from
 * the balance before `from`.
 */
export function balanceSeries(accountId: string, txs: readonly BalanceTx[], from: string, to: string): { date: string; balance: number }[] {
  const relevant = txs.filter((t) => countsForBalance(t) && signedAmountFor(t, accountId) !== 0);
  let running = sumAgorot(relevant.filter((t) => t.date < from).map((t) => signedAmountFor(t, accountId)));
  const byDay = new Map<string, number>();
  for (const t of relevant) {
    if (t.date < from || t.date > to) continue;
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + signedAmountFor(t, accountId));
  }
  const points = [{ date: from, balance: running }];
  for (const date of [...byDay.keys()].sort()) {
    running += byDay.get(date)!;
    if (date === from) points[0] = { date, balance: running };
    else points.push({ date, balance: running });
  }
  if (points[points.length - 1]!.date !== to) points.push({ date: to, balance: running });
  return points;
}

// ---------------------------------------------------------------------------
// Overdraft (SPEC 10.1)
// ---------------------------------------------------------------------------

export const OVERDRAFT_ALERT_BP = 8000; // alert at 80% of the overdraft limit

export interface OverdraftStatus {
  isOverdrawn: boolean;
  availableWithOverdraft: number;
  /** Share of the overdraft limit in use, in bp. 0 when not overdrawn or no limit. */
  utilizationBp: number;
  alert: boolean;
  /** |balance| × annual rate ÷ 12. Display only. */
  estimatedMonthlyInterest: number;
}

export function overdraftStatus(balance: number, account: Pick<Account, 'overdraftLimit' | 'overdraftRatePct'>): OverdraftStatus {
  const limit = account.overdraftLimit ?? 0;
  const isOverdrawn = balance < 0;
  const used = isOverdrawn ? -balance : 0;
  const utilizationBp = limit > 0 ? divRoundHalfUp(used * BP_SCALE, limit) : 0;
  const rate = account.overdraftRatePct ?? 0;
  return {
    isOverdrawn,
    availableWithOverdraft: balance + limit,
    utilizationBp,
    alert: isOverdrawn && (limit === 0 || utilizationBp >= OVERDRAFT_ALERT_BP),
    estimatedMonthlyInterest: divRoundHalfUp(used * rate, BP_SCALE * 12),
  };
}
