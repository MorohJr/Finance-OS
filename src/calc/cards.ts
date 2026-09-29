import type { Card, InstallmentPlan, Transaction } from '../domain/schemas';
import { addDays, addMonths, dayOfMonth, withDay } from './dates';
import { BP_SCALE, divRoundHalfUp, sumAgorot } from './money';

/**
 * Israeli credit cards (SPEC 10.2, 10.3). Pure functions.
 * A statement ("חיוב") is identified by (cardId, chargeDate).
 */

type CardCycle = Pick<Card, 'chargeDay' | 'cycleCutoffDay'>;

export interface Cycle {
  periodStart: string;
  periodEnd: string;
  chargeDate: string;
}

/** The cycle a purchase on `date` belongs to: the first cycle whose closing date is ≥ the purchase. */
export function cycleForDate(date: string, card: CardCycle): Cycle {
  if (card.cycleCutoffDay === null) {
    // Calendar month, charged on chargeDay of the next month.
    const periodStart = withDay(date, 1);
    const periodEnd = addDays(addMonths(periodStart, 1), -1);
    return { periodStart, periodEnd, chargeDate: withDay(addMonths(periodStart, 1), card.chargeDay) };
  }
  const c = card.cycleCutoffDay;
  const periodEnd = dayOfMonth(date) <= c ? withDay(date, c) : withDay(addMonths(withDay(date, 1), 1), c);
  return cycleFromClosing(periodEnd, card);
}

function cycleFromClosing(periodEnd: string, card: CardCycle): Cycle {
  const c = card.cycleCutoffDay!;
  const periodStart = addDays(withDay(addMonths(withDay(periodEnd, 1), -1), c), 1);
  // Charged on the first chargeDay strictly after the closing date.
  const sameMonth = withDay(periodEnd, card.chargeDay);
  const chargeDate = card.chargeDay > c ? sameMonth : withDay(addMonths(withDay(periodEnd, 1), 1), card.chargeDay);
  return { periodStart, periodEnd, chargeDate };
}

/** The cycle that is charged on `chargeDate` (for installment charges and imports). */
export function cycleForChargeDate(chargeDate: string, card: CardCycle): Cycle {
  if (card.cycleCutoffDay === null) {
    const periodStart = withDay(addMonths(withDay(chargeDate, 1), -1), 1);
    return { periodStart, periodEnd: addDays(withDay(chargeDate, 1), -1), chargeDate };
  }
  const c = card.cycleCutoffDay;
  const closing = card.chargeDay > c ? withDay(chargeDate, c) : withDay(addMonths(withDay(chargeDate, 1), -1), c);
  return { ...cycleFromClosing(closing, card), chargeDate };
}

// ---------------------------------------------------------------------------
// Installments (10.3)
// ---------------------------------------------------------------------------

/** base = floor(total / count); the first payment absorbs the remainder. */
export function splitInstallments(totalAgorot: number, count: number): number[] {
  if (!Number.isSafeInteger(totalAgorot) || totalAgorot <= 0) throw new RangeError('total must be a positive integer');
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be ≥ 1');
  const base = Math.floor(totalAgorot / count);
  const first = totalAgorot - base * (count - 1);
  return [first, ...Array.from({ length: count - 1 }, () => base)];
}

export interface InstallmentCharge {
  planId: string;
  transactionId: string;
  cardId: string;
  number: number; // 1-based
  count: number;
  amountAgorot: number;
  chargeDate: string;
}

type PlanLike = Pick<InstallmentPlan, 'id' | 'transactionId' | 'cardId' | 'totalAgorot' | 'count' | 'firstChargeDate'>;

/** Payment schedule: charge i on firstChargeDate + i months, on the card's charge day. */
export function installmentSchedule(plan: PlanLike, card: CardCycle): InstallmentCharge[] {
  return splitInstallments(plan.totalAgorot, plan.count).map((amountAgorot, i) => ({
    planId: plan.id,
    transactionId: plan.transactionId,
    cardId: plan.cardId,
    number: i + 1,
    count: plan.count,
    amountAgorot,
    chargeDate: withDay(addMonths(plan.firstChargeDate, i), card.chargeDay),
  }));
}

export function installmentProgress(schedule: readonly InstallmentCharge[], today: string) {
  const paid = schedule.filter((c) => c.chargeDate <= today);
  return {
    paidCount: paid.length,
    remaining: sumAgorot(schedule.filter((c) => c.chargeDate > today).map((c) => c.amountAgorot)),
  };
}

// ---------------------------------------------------------------------------
// Statements (6.4)
// ---------------------------------------------------------------------------

type CardTx = Pick<Transaction, 'id' | 'kind' | 'amountAgorot' | 'date' | 'cardId' | 'status' | 'deletedAt' | 'links'>;

export interface StatementItem {
  kind: 'purchase' | 'installment' | 'refund';
  transactionId: string;
  amountAgorot: number; // signed: refunds negative
  date: string; // purchase date, or charge date for installments
  installment?: { number: number; count: number };
}

export interface ComputedStatement extends Cycle {
  cardId: string;
  items: StatementItem[];
  /** Own items only. */
  subtotal: number;
  /** Negative remainder carried from the previous statement (credit balance), ≤ 0. */
  carriedIn: number;
  total: number;
}

/**
 * Groups a card's transactions and installment charges into statements.
 * Transactions with `links.statementId` pinned to a stored statement (imports, SPEC 9.3) go to that
 * statement's charge date via `pinnedChargeDate`.
 */
export function computeStatements(
  card: Pick<Card, 'id' | 'chargeDay' | 'cycleCutoffDay'>,
  txs: readonly CardTx[],
  plans: readonly PlanLike[],
  pinnedChargeDate: (statementId: string) => string | undefined = () => undefined,
): ComputedStatement[] {
  const byCharge = new Map<string, StatementItem[]>();
  const push = (chargeDate: string, item: StatementItem) => {
    const list = byCharge.get(chargeDate) ?? [];
    list.push(item);
    byCharge.set(chargeDate, list);
  };
  const planTx = new Set(plans.map((p) => p.transactionId));
  for (const t of txs) {
    if (t.cardId !== card.id || t.deletedAt || t.status !== 'cleared') continue;
    if (t.kind !== 'expense' && t.kind !== 'refund') continue;
    if (planTx.has(t.id)) continue; // charged through its installment schedule
    const pinned = t.links?.statementId ? pinnedChargeDate(t.links.statementId) : undefined;
    const chargeDate = pinned ?? cycleForDate(t.date, card).chargeDate;
    push(chargeDate, {
      kind: t.kind === 'refund' ? 'refund' : 'purchase',
      transactionId: t.id,
      amountAgorot: t.kind === 'refund' ? -t.amountAgorot : t.amountAgorot,
      date: t.date,
    });
  }
  const liveTx = new Set(txs.filter((t) => !t.deletedAt && t.status === 'cleared').map((t) => t.id));
  for (const plan of plans) {
    if (plan.cardId !== card.id || !liveTx.has(plan.transactionId)) continue;
    for (const c of installmentSchedule(plan, card)) {
      push(c.chargeDate, { kind: 'installment', transactionId: c.transactionId, amountAgorot: c.amountAgorot, date: c.chargeDate, installment: { number: c.number, count: c.count } });
    }
  }

  const result: ComputedStatement[] = [];
  let carry = 0;
  for (const chargeDate of [...byCharge.keys()].sort()) {
    const items = byCharge.get(chargeDate)!.sort((a, b) => a.date.localeCompare(b.date));
    const subtotal = sumAgorot(items.map((i) => i.amountAgorot));
    const total = subtotal + carry;
    // DECISION: a negative statement (more refunds than charges) creates no payment; the credit
    // carries into the next statement instead of being lost.
    carry = total < 0 ? total : 0;
    result.push({ ...cycleForChargeDate(chargeDate, card), cardId: card.id, items, subtotal, carriedIn: total - subtotal, total });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Credit limit (10.2)
// ---------------------------------------------------------------------------

export interface CardStatus {
  /** Statements whose period has started and that are not paid yet. */
  openStatementTotal: number;
  /** Installment charges in statements whose period hasn't started yet. */
  futureInstallmentsTotal: number;
  availableCredit: number | null;
  utilizationBp: number | null;
  nextCharge?: { chargeDate: string; total: number };
}

/**
 * `paidChargeDates`: statements already paid (a card_payment exists).
 * Interpretation of 10.2 consistent with golden example 14.2: an installment charge counts as
 * "future" when its statement's period hasn't begun, so nothing is counted twice.
 */
export function cardStatus(
  card: Pick<Card, 'creditLimit' | 'kind'>,
  statements: readonly ComputedStatement[],
  paidChargeDates: ReadonlySet<string>,
  today: string,
): CardStatus {
  const unpaid = statements.filter((s) => !paidChargeDates.has(s.chargeDate));
  const started = unpaid.filter((s) => s.periodStart <= today);
  const future = unpaid.filter((s) => s.periodStart > today);
  const openStatementTotal = sumAgorot(started.map((s) => Math.max(0, s.total)));
  const futureInstallmentsTotal = sumAgorot(future.flatMap((s) => s.items.filter((i) => i.kind === 'installment').map((i) => i.amountAgorot)));
  const limit = card.kind === 'credit' ? card.creditLimit : undefined;
  const availableCredit = limit === undefined ? null : limit - openStatementTotal - futureInstallmentsTotal;
  const next = started[0];
  return {
    openStatementTotal,
    futureInstallmentsTotal,
    availableCredit,
    utilizationBp: limit ? divRoundHalfUp((limit - availableCredit!) * BP_SCALE, limit) : null,
    nextCharge: next ? { chargeDate: next.chargeDate, total: next.total } : undefined,
  };
}

/** Statement status for display and closing (6.4). */
export function statementStatus(s: Cycle, paid: boolean, today: string): 'open' | 'closed' | 'paid' {
  if (paid) return 'paid';
  return today <= s.periodEnd ? 'open' : 'closed';
}

/** Statements due for automatic closing: charge date reached and not paid. */
export function dueForPayment(statements: readonly ComputedStatement[], paidChargeDates: ReadonlySet<string>, today: string): ComputedStatement[] {
  return statements.filter((s) => s.chargeDate <= today && !paidChargeDates.has(s.chargeDate));
}

/** Installment purchases recognized by charge month (spread), for cash flow and budget (10.3, 10.5). */
export function spreadInstallments(
  plans: readonly (PlanLike & Pick<InstallmentPlan, 'budgetRecognition' | 'deletedAt'>)[],
  cards: ReadonlyMap<string, CardCycle>,
): { transactionIds: Set<string>; charges: InstallmentCharge[] } {
  const transactionIds = new Set<string>();
  const charges: InstallmentCharge[] = [];
  for (const p of plans) {
    const card = cards.get(p.cardId);
    if (p.deletedAt || p.budgetRecognition !== 'spread' || !card) continue;
    transactionIds.add(p.transactionId);
    charges.push(...installmentSchedule(p, card));
  }
  return { transactionIds, charges };
}

/** Installment charges of statements whose period hasn't started, summed per charge month (card screen). */
export function futureInstallmentsByMonth(statements: readonly ComputedStatement[], today: string): { month: string; total: number }[] {
  return statements
    .filter((s) => s.periodStart > today)
    .map((s) => ({ month: s.chargeDate.slice(0, 7), total: sumAgorot(s.items.filter((i) => i.kind === 'installment').map((i) => i.amountAgorot)) }))
    .filter((x) => x.total > 0);
}
