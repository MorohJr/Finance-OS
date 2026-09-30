import type { Lending, Loan, Transaction } from '../domain/schemas';
import { addMonths, dayOfMonth, daysBetween } from './dates';
import { BP_SCALE, divRoundHalfUp, sumAgorot } from './money';

/**
 * Loans I took (SPEC 10.6) and loans I gave (10.7).
 * Spitzer's PMT is computed with exact rational arithmetic (BigInt), so no float touches money:
 *   r = bp / 120000,  PMT = P·r·(1+r)^n / ((1+r)^n − 1)
 *                         = P·bp·(120000+bp)^n / (120000·((120000+bp)^n − 120000^n))
 * Every row is rounded to the agora; the last payment absorbs the rounding (decision 30/09/2026).
 */

const MONTHLY_SCALE = 12 * BP_SCALE; // annual bp → monthly rate denominator

export interface ScheduleRow {
  n: number; // 1-based
  date: string;
  payment: number;
  interest: number;
  principal: number;
  balanceAfter: number;
}

type LoanTerms = Pick<Loan, 'principalAgorot' | 'rateType' | 'ratePct' | 'termMonths' | 'amortization' | 'firstPaymentDate'>;

function bigDivRoundHalfUp(num: bigint, den: bigint): number {
  const q = (2n * num + den) / (2n * den);
  return Number(q);
}

/** Spitzer monthly payment, exact then rounded half-up to the agora. */
export function spitzerPayment(principal: number, annualBp: number, months: number): number {
  if (annualBp === 0) return divRoundHalfUp(principal, months);
  const S = BigInt(MONTHLY_SCALE);
  const b = BigInt(annualBp);
  const up = (S + b) ** BigInt(months);
  const down = S ** BigInt(months);
  return bigDivRoundHalfUp(BigInt(principal) * b * up, S * (up - down));
}

/** DECISION 15.1: rateType=total (and flat) uses the template's total interest; an annual rate for flat/bullet converts as rate × months ÷ 12. */
export function totalInterestBp(l: Pick<Loan, 'rateType' | 'ratePct' | 'termMonths'>): number {
  return l.rateType === 'total' ? l.ratePct : divRoundHalfUp(l.ratePct * l.termMonths, 12);
}

export function effectiveMethod(l: Pick<Loan, 'rateType' | 'amortization'>): Loan['amortization'] {
  // SPEC 10.6: rateType=total converts to total interest and uses flat (bullet stays bullet).
  if (l.rateType === 'total' && l.amortization !== 'bullet') return 'flat';
  return l.amortization;
}

export function amortizationSchedule(l: LoanTerms): ScheduleRow[] {
  const P = l.principalAgorot;
  const n = l.termMonths;
  const anchor = dayOfMonth(l.firstPaymentDate);
  const dateOf = (i: number) => addMonths(l.firstPaymentDate, i, anchor);
  const rows: ScheduleRow[] = [];
  const method = effectiveMethod(l);

  if (method === 'bullet') {
    const interest = divRoundHalfUp(P * totalInterestBp(l), BP_SCALE);
    return [{ n: 1, date: l.firstPaymentDate, payment: P + interest, interest, principal: P, balanceAfter: 0 }];
  }

  if (method === 'flat') {
    const totalInterest = divRoundHalfUp(P * totalInterestBp(l), BP_SCALE);
    const payment = divRoundHalfUp(P + totalInterest, n);
    const principalEach = divRoundHalfUp(P, n);
    const interestEach = payment - principalEach;
    let balance = P;
    let paidInterest = 0;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const principal = last ? balance : principalEach;
      const interest = last ? totalInterest - paidInterest : interestEach;
      balance -= principal;
      paidInterest += interest;
      rows.push({ n: i + 1, date: dateOf(i), payment: principal + interest, interest, principal, balanceAfter: balance });
    }
    return rows;
  }

  const monthlyInterest = (balance: number) => divRoundHalfUp(balance * l.ratePct, MONTHLY_SCALE);
  let balance = P;
  if (method === 'spitzer') {
    const pmt = spitzerPayment(P, l.ratePct, n);
    for (let i = 0; i < n; i++) {
      const interest = monthlyInterest(balance);
      const principal = i === n - 1 ? balance : Math.min(balance, pmt - interest);
      balance -= principal;
      rows.push({ n: i + 1, date: dateOf(i), payment: principal + interest, interest, principal, balanceAfter: balance });
    }
    return rows;
  }

  // equal_principal
  const principalEach = divRoundHalfUp(P, n);
  for (let i = 0; i < n; i++) {
    const interest = monthlyInterest(balance);
    const principal = i === n - 1 ? balance : Math.min(balance, principalEach);
    balance -= principal;
    rows.push({ n: i + 1, date: dateOf(i), payment: principal + interest, interest, principal, balanceAfter: balance });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Actual payments (10.6)
// ---------------------------------------------------------------------------

export interface PaymentSplit {
  transactionId: string;
  date: string;
  amount: number;
  interest: number;
  principal: number;
}

export interface LoanStatus {
  schedule: ScheduleRow[];
  monthlyPayment: number;
  totalWithInterest: number;
  totalInterest: number;
  paidPrincipal: number;
  paidInterest: number;
  remainingPrincipal: number;
  progressBp: number;
  status: 'active' | 'paid_off' | 'overdue';
  splits: PaymentSplit[];
  nextPayment?: ScheduleRow;
}

/** Grace days before a missed scheduled payment counts as overdue. */
export const OVERDUE_GRACE_DAYS = 5;

/**
 * Splits actual `loan_payment` transactions: the k-th payment takes the interest of the k-th
 * scheduled row; any difference from the scheduled amount goes to principal (SPEC 10.6).
 * DECISION: matched by order, which handles early and late payments the same way.
 */
export function loanStatus(loan: LoanTerms & Pick<Loan, 'id'>, payments: readonly Pick<Transaction, 'id' | 'date' | 'amountAgorot' | 'kind' | 'links' | 'deletedAt' | 'status'>[], today: string): LoanStatus {
  const schedule = amortizationSchedule(loan);
  const mine = payments
    .filter((t) => t.kind === 'loan_payment' && t.links?.loanId === loan.id && !t.deletedAt && t.status === 'cleared')
    .sort((a, b) => a.date.localeCompare(b.date));
  let remaining = loan.principalAgorot;
  const splits: PaymentSplit[] = mine.map((t, k) => {
    const row = schedule[k];
    const interest = Math.min(row ? row.interest : 0, t.amountAgorot);
    const principal = Math.min(remaining, t.amountAgorot - interest);
    remaining -= principal;
    return { transactionId: t.id, date: t.date, amount: t.amountAgorot, interest, principal };
  });
  const paidPrincipal = sumAgorot(splits.map((s) => s.principal));
  const paidInterest = sumAgorot(splits.map((s) => s.interest));
  const remainingPrincipal = loan.principalAgorot - paidPrincipal;
  const dueCount = schedule.filter((r) => daysBetween(r.date, today) > OVERDUE_GRACE_DAYS).length;
  const status: LoanStatus['status'] = remainingPrincipal <= 0 ? 'paid_off' : mine.length < dueCount ? 'overdue' : 'active';
  return {
    schedule,
    monthlyPayment: schedule[0]?.payment ?? 0,
    totalWithInterest: sumAgorot(schedule.map((r) => r.payment)),
    totalInterest: sumAgorot(schedule.map((r) => r.interest)),
    paidPrincipal,
    paidInterest,
    remainingPrincipal,
    progressBp: divRoundHalfUp(paidPrincipal * BP_SCALE, loan.principalAgorot),
    status,
    splits,
    nextPayment: remainingPrincipal > 0 ? schedule[mine.length] : undefined,
  };
}

/** Interest portion of each loan payment (for cash flow: only interest is an expense). */
export function loanInterestByTx(statuses: readonly LoanStatus[]): Map<string, number> {
  return new Map(statuses.flatMap((s) => s.splits.map((x) => [x.transactionId, x.interest] as const)));
}

// ---------------------------------------------------------------------------
// Loans I gave (10.7)
// ---------------------------------------------------------------------------

export interface LendingStatus {
  totalDue: number;
  repaid: number;
  remaining: number;
  progressBp: number;
  isPaidOff: boolean;
  /** Interest (income) part of each repayment: principal is repaid first. */
  interestByTx: Map<string, number>;
}

export function lendingStatus(l: Pick<Lending, 'id' | 'principalAgorot' | 'ratePct'>, repayments: readonly Pick<Transaction, 'id' | 'date' | 'amountAgorot' | 'kind' | 'links' | 'deletedAt' | 'status' | 'createdAt'>[]): LendingStatus {
  const totalDue = l.principalAgorot + divRoundHalfUp(l.principalAgorot * (l.ratePct ?? 0), BP_SCALE);
  const mine = repayments
    .filter((t) => t.kind === 'lending_repayment' && t.links?.lendingId === l.id && !t.deletedAt && t.status === 'cleared')
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  let repaidSoFar = 0;
  const interestByTx = new Map<string, number>();
  for (const t of mine) {
    const principalLeft = Math.max(0, l.principalAgorot - repaidSoFar);
    interestByTx.set(t.id, Math.max(0, t.amountAgorot - principalLeft));
    repaidSoFar += t.amountAgorot;
  }
  const remaining = Math.max(0, totalDue - repaidSoFar);
  return {
    totalDue,
    repaid: repaidSoFar,
    remaining,
    progressBp: Math.min(BP_SCALE, divRoundHalfUp(repaidSoFar * BP_SCALE, totalDue)),
    isPaidOff: remaining === 0,
    interestByTx,
  };
}

// ---------------------------------------------------------------------------
// Debt metrics (10.6)
// ---------------------------------------------------------------------------

/**
 * Monthly debt (10.6) = Σ PMT of active loans (their regular payment: the next one due; bullet
 * loans have no monthly payment) + installment charges of this month.
 */
export function monthlyDebt(statuses: readonly LoanStatus[], installmentCharges: readonly { chargeDate: string; amountAgorot: number }[], month: string): number {
  const loans = statuses.filter((s) => s.status !== 'paid_off' && s.schedule.length > 1).map((s) => s.nextPayment?.payment ?? s.monthlyPayment);
  const inst = installmentCharges.filter((c) => c.chargeDate.startsWith(month)).map((c) => c.amountAgorot);
  return sumAgorot([...loans, ...inst]);
}

/** Yearly debt = planned payments in the next 12 months (not × 12: loans end). */
export function yearlyDebt(statuses: readonly LoanStatus[], installmentCharges: readonly { chargeDate: string; amountAgorot: number }[], today: string): number {
  const end = addMonths(today, 12);
  const inRange = (d: string) => d > today && d <= end;
  const loans = statuses.filter((s) => s.status !== 'paid_off').flatMap((s) => s.schedule.slice(s.splits.length).filter((r) => inRange(r.date)).map((r) => r.payment));
  const inst = installmentCharges.filter((c) => inRange(c.chargeDate)).map((c) => c.amountAgorot);
  return sumAgorot([...loans, ...inst]);
}

export function scheduleTotal(rows: readonly ScheduleRow[]): number {
  return sumAgorot(rows.map((r) => r.payment));
}
