import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Account, Card, Category, InstallmentPlan, Institution, Payee, Recurring, Transaction } from '../domain/schemas';
import { SETTINGS_ID } from '../domain/schemas';
import { computeBudget, type BudgetSummary } from '../calc/budget';
import { computeForecast, type Forecast } from '../calc/forecast';
import { cardStatus, spreadInstallments, type CardStatus } from '../calc/cards';
import type { SpreadInstallments } from '../calc/cashflow';
import { loadCardData, type CardData } from '../services/cards';
import { accountBalance, balancesByAccount } from '../calc/balance';
import { USER_DATA_TABLES } from '../db/db';
import { hasUserData } from '../services/settings';

/** Live, non-deleted rows. Components re-render when the DB changes. */

export function useAccounts(): Account[] | undefined {
  return useLiveQuery(async () => (await db.accounts.filter((a) => !a.deletedAt).toArray()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), []);
}

export function useTransactions(): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.filter((t) => !t.deletedAt).toArray(), []);
}

/** Includes deleted categories, so history still shows names (principle 5). Filter `deletedAt` for pickers. */
export function useCategories(): Category[] | undefined {
  return useLiveQuery(() => db.categories.toArray(), []);
}

export function usePayees(): Payee[] | undefined {
  return useLiveQuery(() => db.payees.filter((p) => !p.deletedAt).toArray(), []);
}

export function useInstitutions(): Institution[] | undefined {
  return useLiveQuery(() => db.institutions.filter((i) => !i.deletedAt).toArray(), []);
}

export function byId<T extends { id: string }>(rows: readonly T[] | undefined): Map<string, T> {
  return new Map((rows ?? []).map((r) => [r.id, r]));
}

export function useBalances(accounts: Account[] | undefined, txs: Transaction[] | undefined): Map<string, number> {
  return useMemo(() => balancesByAccount((accounts ?? []).map((a) => a.id), txs ?? []), [accounts, txs]);
}

/** Category label with parent: "רכב › דלק". */
export function categoryLabel(c: Category | undefined, all: Map<string, Category>): string {
  if (!c) return '';
  const parent = c.parentId ? all.get(c.parentId) : undefined;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

export function useHasData(): boolean | undefined {
  return useLiveQuery(() => hasUserData(db, USER_DATA_TABLES), []);
}

export function useCards(): Card[] | undefined {
  return useLiveQuery(() => db.cards.filter((c) => !c.deletedAt).toArray(), []);
}

export function usePlans(): InstallmentPlan[] | undefined {
  return useLiveQuery(() => db.installmentPlans.filter((p) => !p.deletedAt).toArray(), []);
}

/** Live statements and limit status for every credit card. */
export function useCardsData(today: string): { data: CardData; status: CardStatus }[] | undefined {
  return useLiveQuery(async () => {
    const cards = await db.cards.filter((c) => !c.deletedAt && c.kind === 'credit').toArray();
    const all = await Promise.all(cards.map((c) => loadCardData(db, c)));
    return all.map((data) => ({ data, status: cardStatus(data.card, data.statements, data.paidChargeDates, today) }));
  }, [today]);
}

/** Installment purchases counted by charge month, for cash flow. */
export function useSpread(): SpreadInstallments | undefined {
  const plans = usePlans();
  const cards = useCards();
  return useMemo(() => (plans && cards ? spreadInstallments(plans, new Map(cards.map((c) => [c.id, c]))) : undefined), [plans, cards]);
}

export function useRecurring(): Recurring[] | undefined {
  return useLiveQuery(() => db.recurring.filter((r) => !r.deletedAt).toArray(), []);
}

export function usePending(): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.where('status').equals('pending').filter((t) => !t.deletedAt).toArray(), []);
}

/** Budget for a month (SPEC 10.5), live. */
export function useBudget(month: string): BudgetSummary | undefined {
  const settings = useLiveQuery(() => db.settings.get(SETTINGS_ID), []);
  const spread = useSpread();
  return useLiveQuery(async () => {
    if (!settings) return undefined;
    const [categories, overrides, txs] = await Promise.all([
      db.categories.toArray(),
      db.budgetOverrides.where('month').equals(month).toArray(),
      db.transactions.where('date').between(`${month}-01`, `${month}-31`, true, true).toArray(),
    ]);
    // Installment charges of this month may come from purchases in earlier months.
    const chargeTxIds = (spread?.charges ?? []).filter((c) => c.chargeDate.startsWith(month)).map((c) => c.transactionId);
    const extra = chargeTxIds.length ? await db.transactions.bulkGet(chargeTxIds) : [];
    const all = [...txs, ...extra.filter((t): t is Transaction => !!t && !txs.some((x) => x.id === t.id))];
    return computeBudget(month, categories, overrides, all, { includeRecurring: settings.includeRecurringInBudget, spread });
  }, [month, settings, spread]);
}

/** Balance forecast for a bank account (SPEC 10.9), live. */
export function useForecast(accountId: string | undefined, today: string, days: number): Forecast | undefined {
  return useLiveQuery(async () => {
    if (!accountId) return undefined;
    const account = await db.accounts.get(accountId);
    if (!account) return undefined;
    const [txs, recurring, cards] = await Promise.all([
      db.transactions.filter((t) => !t.deletedAt && (t.accountId === accountId || t.toAccountId === accountId)).toArray(),
      db.recurring.filter((r) => !r.deletedAt).toArray(),
      db.cards.filter((c) => !c.deletedAt).toArray(),
    ]);
    const billed = cards.filter((c) => c.kind === 'credit' && c.billingAccountId === accountId && c.status === 'active');
    const statements = [];
    for (const card of billed) {
      const d = await loadCardData(db, card);
      statements.push(...d.statements.filter((s) => !d.paidChargeDates.has(s.chargeDate)).map((s) => ({ ...s, cardName: card.name })));
    }
    return computeForecast({
      accountId,
      today,
      days,
      balanceToday: accountBalance(accountId, txs),
      overdraftLimit: account.overdraftLimit,
      pending: txs.filter((t) => t.status === 'pending'),
      recurring,
      cards,
      statements,
    });
  }, [accountId, today, days]);
}
