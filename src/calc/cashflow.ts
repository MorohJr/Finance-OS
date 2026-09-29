import type { Transaction } from '../domain/schemas';
import { BP_SCALE, divRoundHalfUp, sumAgorot } from './money';

/**
 * Income, expenses and cash flow for a date range (SPEC 10.12, principles 3–5).
 * Transfers, opening balances, adjustments, card payments and loan disbursements are never
 * income or expense. Refunds reduce expense in their category. Uncategorized still counts.
 */

export type ContextFilter = 'personal' | 'business' | 'all';

export const UNCATEGORIZED = '__uncategorized__';

type FlowTx = Pick<
  Transaction,
  'kind' | 'amountAgorot' | 'date' | 'categoryId' | 'context' | 'status' | 'deletedAt' | 'business' | 'links'
>;

export interface FlowOptions {
  from: string; // inclusive YYYY-MM-DD
  to: string; // inclusive YYYY-MM-DD
  context?: ContextFilter;
  /**
   * Portion of a loan payment that is interest (expense), and of a lending repayment that is
   * interest (income). Supplied by the loans module (SPEC 10.6, 10.7); default: none.
   */
  interestPart?: (t: FlowTx) => number;
}

export interface FlowSummary {
  income: number;
  expense: number;
  /** income − expense */
  net: number;
  /** expense ÷ income, bp. null when there's no income. */
  expenseRatioBp: number | null;
  /** net ÷ income, bp. null when there's no income. */
  savingsRateBp: number | null;
  /** Net expense per category (expense − refund). Key UNCATEGORIZED for no category. */
  expenseByCategory: Map<string, number>;
  incomeByCategory: Map<string, number>;
}

/** Income amount for reports: business income counts by net, without VAT (SPEC 10.12, 11.2). */
export function reportIncomeAmount(t: Pick<Transaction, 'amountAgorot' | 'business'>): number {
  const b = t.business;
  return b && 'netAgorot' in b ? b.netAgorot : t.amountAgorot;
}

function add(map: Map<string, number>, key: string | undefined, amount: number) {
  const k = key ?? UNCATEGORIZED;
  map.set(k, (map.get(k) ?? 0) + amount);
}

export function summarizeFlows(txs: readonly FlowTx[], options: FlowOptions): FlowSummary {
  const ctx = options.context ?? 'all';
  const interestPart = options.interestPart ?? (() => 0);
  const incomeParts: number[] = [];
  const expenseParts: number[] = [];
  const expenseByCategory = new Map<string, number>();
  const incomeByCategory = new Map<string, number>();

  for (const t of txs) {
    if (t.deletedAt || t.status !== 'cleared') continue;
    if (t.date < options.from || t.date > options.to) continue;
    if (ctx !== 'all' && t.context !== ctx) continue;

    switch (t.kind) {
      case 'income': {
        const amount = reportIncomeAmount(t);
        incomeParts.push(amount);
        add(incomeByCategory, t.categoryId, amount);
        break;
      }
      case 'expense':
        expenseParts.push(t.amountAgorot);
        add(expenseByCategory, t.categoryId, t.amountAgorot);
        break;
      case 'refund':
        expenseParts.push(-t.amountAgorot);
        add(expenseByCategory, t.categoryId, -t.amountAgorot);
        break;
      case 'loan_payment': {
        const interest = interestPart(t);
        if (interest) {
          expenseParts.push(interest);
          add(expenseByCategory, t.categoryId, interest);
        }
        break;
      }
      case 'lending_repayment': {
        const interest = interestPart(t);
        if (interest) {
          incomeParts.push(interest);
          add(incomeByCategory, t.categoryId, interest);
        }
        break;
      }
      default:
        // transfer, card_payment, opening_balance, adjustment, loan_disbursement, lending_out,
        // investment_trade: not income or expense.
        break;
    }
  }

  const income = sumAgorot(incomeParts);
  const expense = sumAgorot(expenseParts);
  const net = income - expense;
  return {
    income,
    expense,
    net,
    expenseRatioBp: income > 0 ? divRoundHalfUp(expense * BP_SCALE, income) : null,
    savingsRateBp: income > 0 ? divRoundHalfUp(net * BP_SCALE, income) : null,
    expenseByCategory,
    incomeByCategory,
  };
}

/** Month range helper: "2026-09" → { from: "2026-09-01", to: "2026-09-30" }. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** "2026-09" → "2026-08". */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** "2026-09" → "2026-10". */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
