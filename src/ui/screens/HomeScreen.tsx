import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Banner } from '../components/Banner';
import { BottomSheet } from '../components/BottomSheet';
import { formatAgorot } from '../../calc/money';
import { Card, SectionTitle } from '../components/Card';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { TransactionRow } from '../components/TransactionRow';
import { byId, useAccounts, useBalances, useBudget, useCards, useCardsData, useCategories, useForecast, useHasData, useInstitutions, usePayees, usePending, useRecurring, useSpread, useTransactions, useLoans, useLendings, useChecks, useFlowOptions, useWishes, usePortfolio, usePension, useLastSnapshot, useBusiness, useBusinessOverview, useTaxSettings, useDebts, useDemoMode, useSnapshots } from '../data';
import { monthlyDebt } from '../../calc/loans';
import { ProgressBar } from '../components/ProgressBar';
import { upcomingReminders } from '../../calc/recurring';
import { budgetState } from '../../calc/budget';
import { usePlatform, useSettings } from '../hooks';
import { isBackupDue } from '../../calc/reminders';
import { currentMonthIL, formatDisplayDate, todayIL } from '../../calc/dates';
import { monthRange, previousMonth, summarizeFlows } from '../../calc/cashflow';
import { computeNetWorth, netWorthChange } from '../../calc/netWorth';
import { sortTransactions } from '../../calc/transactionFilter';
import { buildInsights, categoriesAboveUsual } from '../../calc/dashboard';
import { AccountsCarousel, CardsCarousel, DashboardTabs, InsightsSection } from './HomeSections';
import { isIos } from '../../services/platform';
import { sumAgorot } from '../../calc/money';
import { he } from '../strings.he';

const H = he.home;

function Metric({ label, children, to }: { label: string; children?: ReactNode; to?: string }) {
  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 text-lg font-medium">{children ?? <span className="num text-muted" aria-label={`${label}: ${H.noData}`}>—</span>}</div>
    </>
  );
  return to ? (
    <Link to={to} className="rounded-2xl border border-line bg-surface p-3 active:bg-surface-2">
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl border border-line bg-surface p-3">{body}</div>
  );
}

export function HomeScreen() {
  const settings = useSettings();
  const hasData = useHasData();
  const { installed, persisted } = usePlatform();
  const [installDismissed, setInstallDismissed] = useState(false);
  const [nwOpen, setNwOpen] = useState(false);
  const accounts = useAccounts();
  const txs = useTransactions();
  const balances = useBalances(accounts, txs);
  const accountMap = byId(accounts);
  const categories = byId(useCategories());
  const payees = byId(usePayees());
  const institutions = byId(useInstitutions());

  const cards = useCards();
  const cardsData = useCardsData(todayIL());
  const spread = useSpread();
  const active = (accounts ?? []).filter((a) => a.status === 'active');
  const cardTotals = useMemo(() => {
    const list = cardsData ?? [];
    return {
      open: sumAgorot(list.map((c) => c.status.openStatementTotal)),
      future: sumAgorot(list.map((c) => c.status.futureInstallmentsTotal)),
    };
  }, [cardsData]);
  const loans = useLoans();
  const lendings = useLendings();
  const checks = useChecks();
  const flowOptions = useFlowOptions();
  const wishes = useWishes();
  const owed = useDebts();
  const demo = useDemoMode();
  const portfolio = usePortfolio();
  const pension = usePension();
  const lastSnapshot = useLastSnapshot();
  const business = useBusiness();
  const bizOverview = useBusinessOverview();
  const tax = useTaxSettings();
  const nw = useMemo(
    () =>
      computeNetWorth({
        accountBalances: active.map((a) => balances.get(a.id) ?? 0),
        cardOpenStatements: cardTotals.open,
        cardFutureInstallments: cardTotals.future,
        loansRemainingPrincipal: sumAgorot((loans ?? []).map((l) => Math.max(0, l.status.remainingPrincipal))),
        lendingRemaining: sumAgorot((lendings ?? []).map((l) => l.status.remaining)),
        checksIssuedPending: sumAgorot((checks ?? []).filter((c) => c.direction === 'issued' && (c.status === 'pending' || c.status === 'deposited')).map((c) => c.amountAgorot)),
        securitiesMarketValue: portfolio?.totalValue ?? 0,
        pensionLiquid: sumAgorot((pension ?? []).filter((f) => f.fund.isLiquid).map((f) => f.balance)),
        pensionIlliquid: sumAgorot((pension ?? []).filter((f) => !f.fund.isLiquid).map((f) => f.balance)),
        debtsRemaining: sumAgorot((owed ?? []).map((d) => d.status.remaining)),
      }),
    [active, balances, cardTotals, loans, lendings, checks, portfolio, pension, owed],
  );
  // Change vs last month's snapshot (7.2 header); computed in calc, not here.
  const nwChange = lastSnapshot ? netWorthChange(nw.netWorth, lastSnapshot.netWorth) : 0;
  const debtThisMonth = useMemo(
    () => (loans && spread ? monthlyDebt(loans.map((l) => l.status), spread.charges, currentMonthIL()) : 0) + sumAgorot((owed ?? []).map((d) => d.status.nextPayment?.amount ?? 0)),
    [loans, spread, owed],
  );
  const today = todayIL();
  const budget = useBudget(currentMonthIL());
  const pending = usePending();
  // Only auto-created recurring charges wait for the user (checks and unpaid invoices are just future items).
  const recurringPending = (pending ?? []).filter((t) => t.links?.recurringId);
  const recurring = useRecurring();
  const primaryBank = active.find((a) => a.kind === 'bank' && a.isVisibleOnDashboard) ?? active.find((a) => a.kind === 'bank');
  const forecast30 = useForecast(primaryBank?.id, today, 30);
  const reminders = useMemo(() => upcomingReminders(recurring ?? [], today, 30), [recurring, today]);
  const recurringById = byId(recurring);
  const snapshots = useSnapshots();
  const insights = useMemo(() => {
    if (!txs || !flowOptions) return [];
    const prev = previousMonth(currentMonthIL());
    const last = summarizeFlows(txs, { ...flowOptions, ...monthRange(prev) });
    return buildInsights({
      today,
      forecast: forecast30 && primaryBank ? { accountName: primaryBank.name, belowZero: forecast30.belowZero, minDate: forecast30.minDate, minBalance: forecast30.minBalance } : undefined,
      cardCharges: (cardsData ?? []).flatMap((c) => (c.status.nextCharge ? [{ cardName: c.data.card.name, chargeDate: c.status.nextCharge.chargeDate, total: c.status.nextCharge.total, billingBalance: balances.get(c.data.card.billingAccountId) ?? 0 }] : [])),
      vat: bizOverview?.currentVat ? { dueDate: bizOverview.currentVat.dueDate, vatDue: bizOverview.currentVat.vatDue, paid: bizOverview.currentVat.paid } : undefined,
      budgetOver: budget?.lines ?? [],
      aboveUsual: categoriesAboveUsual(txs, today, flowOptions),
      reminders: reminders.map((r) => ({ name: recurringById.get(r.recurringId)?.name ?? '', date: r.date, kind: r.kind, amount: recurringById.get(r.recurringId)?.amountAgorot })),
      lastMonth: { month: prev, savingsRateBp: last.savingsRateBp },
    });
  }, [txs, flowOptions, today, forecast30, primaryBank, cardsData, balances, bizOverview, budget, reminders, recurringById]);
  const month = useMemo(() => summarizeFlows(txs ?? [], { ...monthRange(currentMonthIL()), ...flowOptions }), [txs, flowOptions]);
  const recent = useMemo(() => sortTransactions((txs ?? []).filter((t) => !t.deletedAt && t.status === 'cleared' && t.date <= todayIL())).slice(0, 3), [txs]);

  const backupDue = settings && hasData !== undefined && isBackupDue(settings.lastBackupAt, hasData);
  const lastBackupLabel = settings?.lastBackupAt ? formatDisplayDate(todayIL(new Date(settings.lastBackupAt))) : he.banners.backupNever;
  const visible = active.filter((a) => a.isVisibleOnDashboard);

  return (
    <>
      <header className="pt-safe bg-surface px-4">
        <div className="flex min-h-14 items-center justify-between">
          <span className="text-lg font-bold">{he.appName}</span>
          <Link to="/settings" aria-label={he.more.settings} className="flex size-11 items-center justify-center rounded-full text-muted active:bg-surface-2">
            <Icon name="settings" />
          </Link>
        </div>
      </header>

      <section aria-label={H.netWorth} className="mx-4 mt-4 rounded-card bg-brand px-4 py-3.5 text-on-brand shadow-sm">
        {active.length ? (
          <button type="button" onClick={() => setNwOpen(true)} className="-m-1 block w-[calc(100%+0.5rem)] rounded-xl p-1 text-start active:bg-brand-strong">
            <span className="flex items-center gap-1 text-sm text-on-brand-muted">
              {H.netWorth}
              <span className="ms-auto flex items-center gap-0.5 text-xs">
                {H.nwDetails}
                <Icon name="chevron" size={16} />
              </span>
            </span>
            <Money agorot={nw.netWorth} className="mt-0.5 block text-3xl font-bold" />
            {nw.pensionIlliquid > 0 && <span className="mt-0.5 block text-xs text-on-brand-muted">{H.nwIncludesPension(formatAgorot(nw.pensionIlliquid, { hideAgorot: true }))}</span>}
            {lastSnapshot && lastSnapshot.month < currentMonthIL() && (
              <span className="mt-0.5 block text-xs text-on-brand-muted">
                <Money agorot={nwChange} signed className="font-medium text-on-brand" /> {H.changeFromLastMonth('').trim()}
              </span>
            )}
          </button>
        ) : (
          <>
            <p className="text-sm text-on-brand-muted">{H.netWorth}</p>
            <p className="num mt-0.5 text-3xl font-bold">—</p>
            <p className="mt-0.5 text-xs text-on-brand-muted">{H.netWorthPending}</p>
          </>
        )}
      </section>

      <BottomSheet open={nwOpen} title={H.nw.title} onClose={() => setNwOpen(false)}>
        <NetWorthBreakdown nw={nw} />
      </BottomSheet>

      <div className="flex flex-col gap-4 px-4 pt-4">
        {!installed && !installDismissed && (
          <Banner icon="share" title={he.banners.installTitle} onDismiss={() => setInstallDismissed(true)}>
            {isIos() ? he.banners.installBodyIos : he.banners.installBodyOther}
          </Banner>
        )}
        {backupDue && !demo && (
          <Banner
            icon="shield"
            tone="warning"
            title={he.banners.backupTitle}
            action={
              <Link to="/settings#backup" className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-medium text-text">
                {he.banners.backupAction}
              </Link>
            }
          >
            {he.banners.backupBody(lastBackupLabel)}
          </Banner>
        )}
        {persisted === false && installed && (
          <Banner icon="alert" tone="warning" title={he.banners.storageTitle}>
            {he.banners.storageBody}
          </Banner>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Metric label={H.liquid} to="/accounts">
            {active.length ? <Money agorot={nw.cashInAccounts} /> : undefined}
          </Metric>
          <Metric label={H.budget} to="/plan/budget">
            {budget && budget.totalBudget > 0 ? (
              <>
                <Money agorot={budget.totalSpent} />
                <div className="mt-1.5">
                  <ProgressBar {...budgetState(budget.totalSpent, budget.totalBudget)} label={H.budget} />
                </div>
                <p className="mt-1 text-xs font-normal text-muted">
                  {he.budget.left} <Money agorot={budget.totalRemaining} />
                </p>
              </>
            ) : undefined}
          </Metric>
          <Metric label={H.cashflow} to={`/transactions?from=${monthRange(currentMonthIL()).from}&to=${monthRange(currentMonthIL()).to}`}>
            {txs?.length ? <Money agorot={month.net} tone={month.net >= 0 ? 'income' : 'expense'} /> : undefined}
          </Metric>
          <Metric label={H.debts} to="/debts">
            {debtThisMonth > 0 || (loans ?? []).length || (owed ?? []).length ? (
              <>
                <Money agorot={debtThisMonth} />
                <p className="text-xs font-normal text-muted">{H.debtsHint}</p>
              </>
            ) : undefined}
          </Metric>
        </div>

        {active.length === 0 && (
          <Card>
            <p className="font-medium">{H.emptyTitle}</p>
            <p className="mt-1 text-sm text-muted">{H.emptyBody}</p>
            <Link to="/accounts/new" className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-full bg-brand px-4 text-sm font-medium text-on-brand">
              <Icon name="plus" size={18} />
              {H.addAccount}
            </Link>
          </Card>
        )}

        {recurringPending.length > 0 && (
          <Link to="/plan/recurring" className="flex min-h-12 items-center gap-2 rounded-card bg-warning-soft px-4 text-sm font-medium text-warning">
            <Icon name="alert" size={18} />
            {H.pendingBanner(recurringPending.length)}
          </Link>
        )}

        <InsightsSection insights={insights} categories={categories} />

        <CardsCarousel cards={cards ?? []} data={cardsData} institutions={institutions} />

        <AccountsCarousel accounts={visible} balances={balances} txs={txs ?? []} institutions={institutions} today={today} />

        {active.length > 0 && txs && flowOptions && (
          <DashboardTabs
            today={today}
            txs={txs}
            flowOptions={flowOptions}
            categories={categories}
            payees={payees}
            budget={budget}
            nw={nw}
            snapshots={snapshots ?? []}
            portfolio={portfolio}
            pension={pension}
            forecast={forecast30}
            forecastAccount={primaryBank}
            wishes={wishes}
            business={business}
            bizOverview={bizOverview}
            tax={tax}
          />
        )}

        {active.length > 0 && (
          <section className="pb-2">
            <div className="flex items-center justify-between">
              <SectionTitle>{H.recent}</SectionTitle>
              <Link to="/transactions" className="min-h-11 px-1 pt-2 text-sm text-brand-text">
                {he.common.showMore}
              </Link>
            </div>
            {recent.length ? (
              <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {recent.map((t) => (
                  <TransactionRow key={t.id} t={t} accounts={accountMap} categories={categories} payees={payees} cards={byId(cards)} />
                ))}
              </div>
            ) : (
              <Card>
                <p className="text-sm text-muted">{H.noRecent}</p>
              </Card>
            )}
          </section>
        )}
      </div>
    </>
  );
}

function NwRow({ label, agorot, negative = false }: { label: string; agorot: number; negative?: boolean }) {
  if (!agorot) return null;
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-sm">{label}</span>
      <Money agorot={negative ? -agorot : agorot} className="shrink-0 font-medium" />
    </li>
  );
}

function NetWorthBreakdown({ nw }: { nw: ReturnType<typeof computeNetWorth> }) {
  const N = H.nw;
  const b = nw.breakdown;
  return (
    <div className="flex flex-col gap-4 pb-4">
      <p className="text-sm text-muted">{N.explain}</p>
      <section>
        <h3 className="flex justify-between font-bold">
          <span>{N.assets}</span>
          <Money agorot={nw.assets} />
        </h3>
        <ul className="divide-y divide-line">
          <NwRow label={N.accounts} agorot={b.positiveAccounts} />
          <NwRow label={N.securities} agorot={b.securities} />
          <NwRow label={N.pensionLiquid} agorot={nw.pensionLiquid} />
          <NwRow label={N.pensionLocked} agorot={nw.pensionIlliquid} />
          <NwRow label={N.lending} agorot={b.lending} />
        </ul>
      </section>
      <section>
        <h3 className="flex justify-between font-bold">
          <span>{N.liabilities}</span>
          <Money agorot={-nw.liabilities} />
        </h3>
        <ul className="divide-y divide-line">
          <NwRow label={N.negativeAccounts} agorot={b.negativeAccounts} negative />
          <NwRow label={N.cards} agorot={b.cards} negative />
          <NwRow label={N.loans} agorot={b.loans} negative />
          <NwRow label={N.checks} agorot={b.checks} negative />
          <NwRow label={N.debts} agorot={b.debts} negative />
        </ul>
      </section>
      <div className="rounded-card bg-surface-2 p-4">
        <p className="flex justify-between text-lg font-bold">
          <span>{N.total}</span>
          <Money agorot={nw.netWorth} />
        </p>
        {nw.pensionIlliquid > 0 && (
          <p className="mt-1 flex justify-between text-sm text-muted">
            <span>{N.withoutPension}</span>
            <Money agorot={nw.netWorthExcludingPension} />
          </p>
        )}
        <p className="mt-1 flex justify-between text-sm text-muted">
          <span>{N.liquid}</span>
          <Money agorot={nw.liquidAssets} />
        </p>
      </div>
    </div>
  );
}
