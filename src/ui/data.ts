import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Account, Business, Card, Category, Check, InstallmentPlan, Institution, Lending, Loan, NetWorthSnapshot, Payee, Recurring, Sector, TaxSettings, Transaction, WishItem } from '../domain/schemas';
import { loadBusinessOverview, taxSettingsAt } from '../services/business';
import type { BusinessOverview } from '../calc/business/overview';
import { portfolio, type Portfolio } from '../calc/investments';
import { fundViews, type FundView } from '../calc/pension';
import { wishStatus, type WishStatus } from '../calc/wish';
import { lendingStatus, loanInterestByTx, loanStatus, type LendingStatus, type LoanStatus } from '../calc/loans';
import { addDays, todayIL } from '../calc/dates';
import { expectedSalaryEvents } from '../calc/salary';
import { SETTINGS_ID } from '../domain/schemas';
import { computeBudget, type BudgetSummary } from '../calc/budget';
import { computeForecast, type Forecast, type ForecastEvent } from '../calc/forecast';
import { cardStatus, installmentSchedule, spreadInstallments, type CardStatus } from '../calc/cards';
import type { FlowOptions, SpreadInstallments } from '../calc/cashflow';
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
    // Scheduled loan payments not yet recorded (10.9: "− loan payments until day").
    const loans = await db.loans.filter((l) => !l.deletedAt && l.accountId === accountId).toArray();
    const loanPayments = await db.transactions.where('kind').equals('loan_payment').toArray();
    const extraEvents: ForecastEvent[] = loans.flatMap((loan): ForecastEvent[] => {
      const st = loanStatus(loan, loanPayments, today);
      if (st.status === 'paid_off') return [];
      return st.schedule.slice(st.splits.length).map((r) => ({ date: r.date < today ? today : r.date, amountAgorot: -r.payment, kind: 'loan' as const, label: loan.name, refId: loan.id }));
    });
    const [employers, payslips] = await Promise.all([db.employers.toArray(), db.payslips.toArray()]);
    extraEvents.push(...expectedSalaryEvents(employers, payslips, accountId, today, addDays(today, days)));
    return computeForecast({
      extraEvents,
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

export function useLoans(): { loan: Loan; status: LoanStatus }[] | undefined {
  return useLiveQuery(async () => {
    const loans = await db.loans.filter((l) => !l.deletedAt).toArray();
    const payments = await db.transactions.where('kind').equals('loan_payment').toArray();
    const today = todayIL();
    return loans.map((loan) => ({ loan, status: loanStatus(loan, payments, today) }));
  }, []);
}

export function useLendings(): { lending: Lending; status: LendingStatus }[] | undefined {
  return useLiveQuery(async () => {
    const lendings = await db.lendings.filter((l) => !l.deletedAt).toArray();
    const repayments = await db.transactions.where('kind').equals('lending_repayment').toArray();
    return lendings.map((lending) => ({ lending, status: lendingStatus(lending, repayments) }));
  }, []);
}

export function useChecks(): Check[] | undefined {
  return useLiveQuery(() => db.checks.filter((c) => !c.deletedAt).toArray(), []);
}

/** Everything cash flow needs beyond the transactions: spread installments and loan/lending interest (10.6, 10.7, 10.12). */
export function useFlowOptions(): Pick<FlowOptions, 'spread' | 'interestPart'> | undefined {
  const spread = useSpread();
  const loans = useLoans();
  const lendings = useLendings();
  return useMemo(() => {
    if (!spread || !loans || !lendings) return undefined;
    const interest = loanInterestByTx(loans.map((l) => l.status));
    for (const l of lendings) for (const [k, v] of l.status.interestByTx) interest.set(k, v);
    return { spread, interestPart: (t: { id: string }) => interest.get(t.id) ?? 0 };
  }, [spread, loans, lendings]);
}

export function useWishes(): { item: WishItem; status: WishStatus }[] | undefined {
  return useLiveQuery(async () => {
    const items = await db.wishItems.filter((w) => !w.deletedAt).toArray();
    const txs = await db.transactions.filter((t) => !!t.links?.wishItemId).toArray();
    const plans = await db.installmentPlans.filter((p) => !p.deletedAt).toArray();
    const cards = new Map((await db.cards.toArray()).map((c) => [c.id, c]));
    const chargesByTx = new Map(plans.filter((p) => cards.has(p.cardId)).map((p) => [p.transactionId, installmentSchedule(p, cards.get(p.cardId)!)]));
    const today = todayIL();
    return items.map((item) => ({ item, status: wishStatus(item, txs, plans, chargesByTx, today) }));
  }, []);
}

/** Object URL for a stored image; revoked when the component unmounts or the id changes. */
export function useAttachmentUrl(id: string | undefined): string | undefined {
  const blob = useLiveQuery(async () => (id ? (await db.attachments.get(id))?.blob : undefined), [id]);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

export function usePortfolio(): Portfolio | undefined {
  return useLiveQuery(async () => {
    const [securities, trades, prices, fx, settings, tax] = await Promise.all([
      db.securities.filter((s) => !s.deletedAt).toArray(),
      db.investmentTrades.filter((t) => !t.deletedAt).toArray(),
      db.pricePoints.toArray(),
      db.fxRates.toArray(),
      db.settings.get(SETTINGS_ID),
      db.taxSettings.orderBy('effectiveFrom').last(),
    ]);
    return portfolio(securities, trades, prices, fx, { method: settings?.costBasisMethod ?? 'moving_average', today: todayIL(), capitalGainsRateBp: tax?.capitalGainsRateBp ?? 2500 });
  }, []);
}

export function usePension(): FundView[] | undefined {
  return useLiveQuery(async () => fundViews(await db.pensionFunds.toArray(), await db.pensionSnapshots.toArray(), todayIL()), []);
}

export function useSectors(): Sector[] | undefined {
  return useLiveQuery(() => db.sectors.filter((s) => !s.deletedAt).sortBy('sortOrder'), []);
}

export function useLastSnapshot(): NetWorthSnapshot | undefined {
  return useLiveQuery(() => db.netWorthSnapshots.orderBy('month').last(), []);
}

export function useBusiness(): Business | null | undefined {
  return useLiveQuery(async () => (await db.businesses.filter((b) => !b.deletedAt).first()) ?? null, []);
}

export function useTaxSettings(date: string = todayIL()): TaxSettings | undefined {
  return useLiveQuery(() => taxSettingsAt(db, date), [date]);
}

export function useBusinessOverview(): BusinessOverview | null | undefined {
  return useLiveQuery(async () => (await loadBusinessOverview(db)) ?? null, []);
}
