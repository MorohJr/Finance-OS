import type { BudgetOverride, Category, Transaction } from '../domain/schemas';
import type { SpreadInstallments } from './cashflow';
import { monthRange } from './cashflow';
import { BP_SCALE, divRoundHalfUp, sumAgorot } from './money';

/**
 * Monthly budget (SPEC 10.5). Calendar month. Counts expense − refund of personal transactions
 * in categories with includeInBudget. Recurring bills and subscriptions and Wish List purchases
 * are excluded by default (DECISION 15.5), installments by their budgetRecognition (DECISION 15.3).
 */

export const NEAR_BP = 8000; // 80%
export const UNCATEGORIZED_BUDGET = '__uncategorized__';

export type BudgetState = 'ok' | 'near' | 'over' | 'none';

export interface BudgetLine {
  categoryId: string;
  budget: number | null;
  spent: number;
  remaining: number | null;
  overBudget: number;
  usedBp: number | null;
  state: BudgetState;
  /** Direct children's lines (their spending is already inside the parent's). */
  children: BudgetLine[];
}

export interface BudgetSummary {
  month: string;
  lines: BudgetLine[];
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  uncategorizedSpent: number;
}

type BudgetTx = Pick<Transaction, 'id' | 'kind' | 'amountAgorot' | 'date' | 'categoryId' | 'context' | 'status' | 'deletedAt' | 'links'>;

export interface BudgetOptions {
  includeRecurring: boolean;
  spread?: SpreadInstallments;
}

export function budgetState(spent: number, budget: number | null): { usedBp: number | null; state: BudgetState } {
  if (budget === null) return { usedBp: null, state: 'none' };
  if (budget === 0) return { usedBp: spent > 0 ? null : 0, state: spent > 0 ? 'over' : 'ok' };
  const usedBp = divRoundHalfUp(spent * BP_SCALE, budget);
  return { usedBp, state: usedBp > BP_SCALE ? 'over' : usedBp >= NEAR_BP ? 'near' : 'ok' };
}

function line(categoryId: string, budget: number | null, spent: number, children: BudgetLine[] = []): BudgetLine {
  const { usedBp, state } = budgetState(spent, budget);
  return {
    categoryId,
    budget,
    spent,
    remaining: budget === null ? null : budget - spent,
    overBudget: budget === null ? 0 : Math.max(0, spent - budget),
    usedBp,
    state,
    children,
  };
}

export function computeBudget(
  month: string,
  categories: readonly Pick<Category, 'id' | 'type' | 'parentId' | 'includeInBudget' | 'monthlyBudget' | 'context' | 'deletedAt'>[],
  overrides: readonly Pick<BudgetOverride, 'categoryId' | 'month' | 'amountAgorot' | 'deletedAt'>[],
  txs: readonly BudgetTx[],
  options: BudgetOptions,
): BudgetSummary {
  const { from, to } = monthRange(month);
  const included = new Map(categories.filter((c) => !c.deletedAt && c.type === 'expense' && c.includeInBudget && c.context !== 'business').map((c) => [c.id, c]));
  const spentByCat = new Map<string, number>();
  let uncategorized = 0;

  const count = (t: BudgetTx, amount: number) => {
    if (t.context !== 'personal') return;
    if (!options.includeRecurring && (t.links?.recurringId || t.links?.wishItemId)) return;
    if (!t.categoryId) {
      uncategorized += amount;
      return;
    }
    if (!included.has(t.categoryId)) return;
    spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) ?? 0) + amount);
  };

  const spreadIds = options.spread?.transactionIds ?? new Set<string>();
  const txById = new Map(txs.map((t) => [t.id, t]));
  for (const c of options.spread?.charges ?? []) {
    const t = txById.get(c.transactionId);
    if (!t || t.deletedAt || t.status !== 'cleared' || t.kind !== 'expense') continue;
    if (c.chargeDate >= from && c.chargeDate <= to) count(t, c.amountAgorot);
  }
  for (const t of txs) {
    if (t.deletedAt || t.status !== 'cleared' || spreadIds.has(t.id)) continue;
    if (t.date < from || t.date > to) continue;
    if (t.kind === 'expense') count(t, t.amountAgorot);
    else if (t.kind === 'refund') count(t, -t.amountAgorot);
  }

  const overrideFor = new Map(overrides.filter((o) => !o.deletedAt && o.month === month).map((o) => [o.categoryId, o.amountAgorot]));
  const budgetOf = (c: { id: string; monthlyBudget?: number }) => overrideFor.get(c.id) ?? c.monthlyBudget ?? null;

  // DECISION: a parent's line includes its sub-categories' spending (one level, SPEC 6.6).
  const tops = [...included.values()].filter((c) => !c.parentId || !included.has(c.parentId));
  const lines = tops.map((p) => {
    const kids = [...included.values()].filter((c) => c.parentId === p.id).map((c) => line(c.id, budgetOf(c), spentByCat.get(c.id) ?? 0));
    const spent = (spentByCat.get(p.id) ?? 0) + sumAgorot(kids.map((k) => k.spent));
    return line(p.id, budgetOf(p), spent, kids);
  });

  const withActivity = lines.filter((l) => l.budget !== null || l.spent !== 0);
  const totalBudget = sumAgorot(lines.map((l) => l.budget ?? 0));
  const totalSpent = sumAgorot(lines.map((l) => l.spent)) + uncategorized;
  return {
    month,
    lines: withActivity.sort((a, b) => b.spent - a.spent),
    totalBudget,
    totalSpent,
    totalRemaining: totalBudget - totalSpent,
    uncategorizedSpent: uncategorized,
  };
}
