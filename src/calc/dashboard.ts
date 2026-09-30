import type { Transaction } from '../domain/schemas';
import { monthRange, previousMonth, summarizeFlows, type FlowOptions } from './cashflow';
import { addDays, daysBetween } from './dates';
import { BP_SCALE, divRoundHalfUp, sumAgorot } from './money';
import type { NetWorth } from './netWorth';

/**
 * Dashboard sections (owner request 01/10/2026): the extra charts and insights on the home
 * screen. Every number here comes from the existing flow, balance and net-worth calculations.
 */

type Txs = Parameters<typeof summarizeFlows>[0];
type Opts = Omit<FlowOptions, 'from' | 'to'>;

/** The last `n` months ending with `month`, oldest first. */
export function lastMonths(month: string, n: number): string[] {
  const out = [month];
  while (out.length < n) out.unshift(previousMonth(out[0]!));
  return out;
}

/** Income vs expense per month (dashboard option 1). */
export function incomeVsExpense(txs: Txs, months: readonly string[], opts: Opts): { month: string; income: number; expense: number }[] {
  return months.map((month) => {
    const s = summarizeFlows(txs, { ...opts, ...monthRange(month) });
    return { month, income: s.income, expense: s.expense };
  });
}

/** Expense per day of the month, up to `today` (option 5). `average` is per elapsed day. */
export function dailySpending(txs: Txs, month: string, today: string, opts: Opts): { days: { date: string; expense: number }[]; total: number; average: number; daysInMonth: number } {
  const { from, to } = monthRange(month);
  const daysInMonth = Number(to.slice(8));
  const last = today < to ? today : to;
  const days: { date: string; expense: number }[] = [];
  if (today >= from) {
    for (let d = from; d <= last; d = addDays(d, 1)) days.push({ date: d, expense: summarizeFlows(txs, { ...opts, from: d, to: d }).expense });
  }
  const total = sumAgorot(days.map((d) => d.expense));
  return { days, total, average: days.length ? divRoundHalfUp(total, days.length) : 0, daysInMonth };
}

export interface CategoryChange {
  categoryId: string;
  current: number;
  previous: number;
  delta: number;
  /** delta ÷ previous, bp; null when there was nothing last month. */
  deltaBp: number | null;
}

/**
 * This month so far vs the same days of last month, per expense category (option 5).
 * Comparing to the same days keeps a half-finished month from always looking cheaper.
 */
export function categoryChanges(txs: Txs, today: string, opts: Opts): CategoryChange[] {
  const month = today.slice(0, 7);
  const prev = previousMonth(month);
  const prevRange = monthRange(prev);
  const sameDay = `${prev}-${today.slice(8)}`;
  const prevTo = sameDay < prevRange.to ? sameDay : prevRange.to;
  const cur = summarizeFlows(txs, { ...opts, from: `${month}-01`, to: today }).expenseByCategory;
  const old = summarizeFlows(txs, { ...opts, from: prevRange.from, to: prevTo }).expenseByCategory;
  const ids = new Set([...cur.keys(), ...old.keys()]);
  return [...ids]
    .map((categoryId) => {
      const current = cur.get(categoryId) ?? 0;
      const previous = old.get(categoryId) ?? 0;
      return { categoryId, current, previous, delta: current - previous, deltaBp: previous > 0 ? divRoundHalfUp((current - previous) * BP_SCALE, previous) : null };
    })
    // Only what was spent this month: early in the month everything else would read as "−100%".
    .filter((c) => c.current > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Where the money went, by payee (option 5): net expense and number of purchases. */
export function topPayees(
  txs: readonly Pick<Transaction, 'kind' | 'amountAgorot' | 'date' | 'payeeId' | 'status' | 'deletedAt' | 'context'>[],
  from: string,
  to: string,
  n: number,
  context: 'personal' | 'business' | 'all' = 'all',
): { payeeId: string; amount: number; count: number }[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const t of txs) {
    if (t.deletedAt || t.status !== 'cleared' || !t.payeeId || t.date < from || t.date > to) continue;
    if (context !== 'all' && t.context !== context) continue;
    if (t.kind !== 'expense' && t.kind !== 'refund') continue;
    const row = map.get(t.payeeId) ?? { amount: 0, count: 0 };
    row.amount += t.kind === 'expense' ? t.amountAgorot : -t.amountAgorot;
    if (t.kind === 'expense') row.count += 1;
    map.set(t.payeeId, row);
  }
  return [...map.entries()]
    .map(([payeeId, v]) => ({ payeeId, ...v }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

export type AllocationKey = 'accounts' | 'securities' | 'pensionLiquid' | 'pensionLocked' | 'lending';

/** Asset allocation as shares of total assets (option 6). Negative accounts are liabilities, not here. */
export function assetAllocation(nw: Pick<NetWorth, 'assets' | 'pensionLiquid' | 'pensionIlliquid' | 'breakdown'>): { key: AllocationKey; amount: number; shareBp: number }[] {
  const parts: [AllocationKey, number][] = [
    ['accounts', nw.breakdown.positiveAccounts],
    ['securities', nw.breakdown.securities],
    ['pensionLiquid', nw.pensionLiquid],
    ['pensionLocked', nw.pensionIlliquid],
    ['lending', nw.breakdown.lending],
  ];
  if (nw.assets <= 0) return [];
  return parts.filter(([, v]) => v > 0).map(([key, amount]) => ({ key, amount, shareBp: divRoundHalfUp(amount * BP_SCALE, nw.assets) }));
}

/** Shares in bp of a list of positive amounts (donut); an empty or zero list gives []. */
export function sharesOf<T extends { amount: number }>(items: readonly T[]): (T & { shareBp: number })[] {
  const total = sumAgorot(items.map((x) => Math.max(0, x.amount)));
  if (total <= 0) return [];
  return items.filter((x) => x.amount > 0).map((x) => ({ ...x, shareBp: divRoundHalfUp(x.amount * BP_SCALE, total) }));
}

/** Change from the first to the last value of a series (net worth or portfolio trend). */
export function seriesChange(values: readonly number[]): { delta: number; deltaBp: number | null } {
  if (values.length < 2) return { delta: 0, deltaBp: null };
  const first = values[0]!;
  const delta = values[values.length - 1]! - first;
  return { delta, deltaBp: first > 0 ? divRoundHalfUp(delta * BP_SCALE, first) : null };
}

/** Pension and long-term savings: total balance and deposits since January, across funds. */
export function pensionTotals(funds: readonly { balance: number; depositsYtd: { total: number } }[]): { balance: number; depositsYtd: number } {
  return { balance: sumAgorot(funds.map((f) => f.balance)), depositsYtd: sumAgorot(funds.map((f) => f.depositsYtd.total)) };
}

// ---------------------------------------------------------------------------
// Insights (option 7)
// ---------------------------------------------------------------------------

/** A category counts as "above usual" at +20% over its 3-month average, and at least ₪200 more. */
export const ABOVE_USUAL_BP = 2_000;
export const ABOVE_USUAL_MIN_AGOROT = 20_000;

/**
 * Categories where this month so far already beats the average of the 3 previous full months.
 * Only spending that already happened counts, so the result never grows as the month ends.
 */
export function categoriesAboveUsual(txs: Txs, today: string, opts: Opts): { categoryId: string; current: number; average: number; overBp: number }[] {
  const month = today.slice(0, 7);
  const past = lastMonths(previousMonth(month), 3);
  const sums = past.map((m) => summarizeFlows(txs, { ...opts, ...monthRange(m) }).expenseByCategory);
  const cur = summarizeFlows(txs, { ...opts, from: `${month}-01`, to: today }).expenseByCategory;
  const out: { categoryId: string; current: number; average: number; overBp: number }[] = [];
  for (const [categoryId, current] of cur) {
    const average = divRoundHalfUp(sumAgorot(sums.map((s) => s.get(categoryId) ?? 0)), past.length);
    if (average <= 0 || current - average < ABOVE_USUAL_MIN_AGOROT) continue;
    const overBp = divRoundHalfUp((current - average) * BP_SCALE, average);
    if (overBp >= ABOVE_USUAL_BP) out.push({ categoryId, current, average, overBp });
  }
  return out.sort((a, b) => b.current - b.average - (a.current - a.average));
}

export type Insight =
  | { kind: 'forecast_low'; tone: 'warning'; accountName: string; date: string; balance: number }
  | { kind: 'card_charge'; tone: 'info' | 'warning'; cardName: string; date: string; amount: number; covered: boolean }
  | { kind: 'vat_due'; tone: 'info'; date: string; amount: number }
  | { kind: 'budget_over'; tone: 'warning'; categoryId: string; usedBp: number }
  | { kind: 'above_usual'; tone: 'warning'; categoryId: string; current: number; average: number; overBp: number }
  | { kind: 'renewal'; tone: 'info'; name: string; date: string; reminder: 'due' | 'trial_end' | 'commitment_end' | 'renewal'; amount?: number }
  | { kind: 'savings_rate'; tone: 'good' | 'warning'; month: string; rateBp: number };

export interface InsightInput {
  today: string;
  forecast?: { accountName: string; belowZero: boolean; minDate: string; minBalance: number };
  /** Next unpaid charge per card, with the balance of the account it's charged to. */
  cardCharges: readonly { cardName: string; chargeDate: string; total: number; billingBalance: number }[];
  vat?: { dueDate: string; vatDue: number; paid: boolean };
  budgetOver: readonly { categoryId: string; usedBp: number | null; state: 'ok' | 'near' | 'over' | 'none' }[];
  aboveUsual: ReturnType<typeof categoriesAboveUsual>;
  reminders: readonly { name: string; date: string; kind: 'due' | 'trial_end' | 'commitment_end' | 'renewal'; amount?: number }[];
  lastMonth?: { month: string; savingsRateBp: number | null };
}

/** Days ahead that count as "soon" for charges, renewals and VAT. */
export const SOON_DAYS = 7;
export const VAT_SOON_DAYS = 21;

/** Picks and orders what's worth saying today: problems first, then what's coming, then good news. */
export function buildInsights(i: InsightInput, limit = 5): Insight[] {
  const out: Insight[] = [];
  const soon = (d: string, days = SOON_DAYS) => d >= i.today && daysBetween(i.today, d) <= days;

  if (i.forecast?.belowZero) out.push({ kind: 'forecast_low', tone: 'warning', accountName: i.forecast.accountName, date: i.forecast.minDate, balance: i.forecast.minBalance });
  for (const c of [...i.cardCharges].sort((a, b) => a.chargeDate.localeCompare(b.chargeDate))) {
    if (c.total <= 0 || !soon(c.chargeDate)) continue;
    const covered = c.billingBalance >= c.total;
    out.push({ kind: 'card_charge', tone: covered ? 'info' : 'warning', cardName: c.cardName, date: c.chargeDate, amount: c.total, covered });
  }
  for (const b of i.budgetOver) if (b.state === 'over' && b.usedBp !== null) out.push({ kind: 'budget_over', tone: 'warning', categoryId: b.categoryId, usedBp: b.usedBp });
  const overIds = new Set(i.budgetOver.filter((b) => b.state === 'over').map((b) => b.categoryId));
  for (const a of i.aboveUsual.slice(0, 2)) if (!overIds.has(a.categoryId)) out.push({ kind: 'above_usual', tone: 'warning', ...a });
  if (i.vat && !i.vat.paid && i.vat.vatDue > 0 && soon(i.vat.dueDate, VAT_SOON_DAYS)) out.push({ kind: 'vat_due', tone: 'info', date: i.vat.dueDate, amount: i.vat.vatDue });
  for (const r of i.reminders) if (soon(r.date)) out.push({ kind: 'renewal', tone: 'info', name: r.name, date: r.date, reminder: r.kind, amount: r.amount });
  if (i.lastMonth && i.lastMonth.savingsRateBp !== null) out.push({ kind: 'savings_rate', tone: i.lastMonth.savingsRateBp >= 0 ? 'good' : 'warning', month: i.lastMonth.month, rateBp: i.lastMonth.savingsRateBp });

  // Warnings first, keeping each group's own order.
  const rank = { warning: 0, info: 1, good: 2 } as const;
  return out
    .map((x, idx) => ({ x, idx }))
    .sort((a, b) => rank[a.x.tone] - rank[b.x.tone] || a.idx - b.idx)
    .map(({ x }) => x)
    .slice(0, limit);
}
