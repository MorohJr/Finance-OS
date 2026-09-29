import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Banner } from '../components/Banner';
import { Card, SectionTitle } from '../components/Card';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { Monogram } from '../components/Monogram';
import { TransactionRow } from '../components/TransactionRow';
import { byId, categoryLabel, useAccounts, useBalances, useBudget, useCards, useCardsData, useCategories, useForecast, useHasData, useInstitutions, usePayees, usePending, useRecurring, useSpread, useTransactions } from '../data';
import { ForecastEvents } from '../components/ForecastEvents';
import { ProgressBar } from '../components/ProgressBar';
import { upcomingReminders } from '../../calc/recurring';
import { budgetState } from '../../calc/budget';
import { CardSummary } from '../components/CardSummary';
import { usePlatform, useSettings } from '../hooks';
import { isBackupDue } from '../../calc/reminders';
import { currentMonthIL, formatDisplayDate, todayIL } from '../../calc/dates';
import { monthRange, summarizeFlows } from '../../calc/cashflow';
import { computeNetWorth } from '../../calc/netWorth';
import { sortTransactions } from '../../calc/transactionFilter';
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
  const nw = useMemo(
    () => computeNetWorth({ accountBalances: active.map((a) => balances.get(a.id) ?? 0), cardOpenStatements: cardTotals.open, cardFutureInstallments: cardTotals.future }),
    [active, balances, cardTotals],
  );
  const today = todayIL();
  const budget = useBudget(currentMonthIL());
  const pending = usePending();
  const recurring = useRecurring();
  const primaryBank = active.find((a) => a.kind === 'bank' && a.isVisibleOnDashboard) ?? active.find((a) => a.kind === 'bank');
  const forecast30 = useForecast(primaryBank?.id, today, 30);
  const reminders = useMemo(() => upcomingReminders(recurring ?? [], today, 30), [recurring, today]);
  const recurringById = byId(recurring);
  const month = useMemo(() => summarizeFlows(txs ?? [], { ...monthRange(currentMonthIL()), spread }), [txs, spread]);
  const recent = useMemo(() => sortTransactions(txs ?? []).slice(0, 5), [txs]);

  const backupDue = settings && hasData !== undefined && isBackupDue(settings.lastBackupAt, hasData);
  const lastBackupLabel = settings?.lastBackupAt ? formatDisplayDate(todayIL(new Date(settings.lastBackupAt))) : he.banners.backupNever;
  const visible = active.filter((a) => a.isVisibleOnDashboard);

  return (
    <>
      <header className="pt-safe rounded-b-[28px] bg-brand px-5 pb-6 text-on-brand">
        <div className="flex min-h-14 items-center justify-between">
          <span className="text-lg font-bold">{he.appName}</span>
          <Link to="/settings" aria-label={he.more.settings} className="flex size-11 items-center justify-center rounded-full active:bg-brand-strong">
            <Icon name="settings" />
          </Link>
        </div>
        <p className="text-sm text-on-brand-muted">{H.netWorth}</p>
        {active.length ? <Money agorot={nw.netWorth} className="mt-1 block text-4xl font-bold" /> : <p className="num mt-1 text-4xl font-bold">—</p>}
        <p className="mt-1 text-sm text-on-brand-muted">{active.length ? H.netWorthPartial : H.netWorthPending}</p>
      </header>

      <div className="flex flex-col gap-4 px-4 pt-4">
        {!installed && !installDismissed && (
          <Banner icon="share" title={he.banners.installTitle} onDismiss={() => setInstallDismissed(true)}>
            {isIos() ? he.banners.installBodyIos : he.banners.installBodyOther}
          </Banner>
        )}
        {backupDue && (
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
            {active.length ? <Money agorot={nw.liquidAssets} /> : undefined}
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
          <Metric label={H.debts} to="/soon/debts" />
        </div>

        {active.length === 0 ? (
          <Card>
            <p className="font-medium">{H.emptyTitle}</p>
            <p className="mt-1 text-sm text-muted">{H.emptyBody}</p>
            <Link to="/accounts/new" className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-full bg-brand px-4 text-sm font-medium text-on-brand">
              <Icon name="plus" size={18} />
              {H.addAccount}
            </Link>
          </Card>
        ) : (
          <section>
            <div className="flex items-center justify-between">
              <SectionTitle>{H.accounts}</SectionTitle>
              <Link to="/accounts" className="min-h-11 px-1 pt-2 text-sm text-brand-text">
                {he.common.showMore}
              </Link>
            </div>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {visible.slice(0, 5).map((a) => {
                const inst = a.institutionId ? institutions.get(a.institutionId) : undefined;
                const bal = balances.get(a.id) ?? 0;
                return (
                  <Link key={a.id} to={`/accounts/${a.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-surface-2">
                    <Monogram name={inst?.name ?? a.name} color={a.color ?? inst?.color} size={32} />
                    <span className="flex-1 truncate">{a.name}</span>
                    <Money agorot={bal} tone={bal < 0 ? 'expense' : 'plain'} className="font-medium" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {(cards ?? []).some((c) => c.status === 'active') && (
          <section>
            <SectionTitle>{H.cards}</SectionTitle>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {(cards ?? [])
                .filter((c) => c.status === 'active')
                .map((c) => (
                  <CardSummary key={c.id} card={c} status={cardsData?.find((d) => d.data.card.id === c.id)?.status} issuer={institutions.get(c.issuerId)} />
                ))}
            </div>
          </section>
        )}

        {(pending ?? []).length > 0 && (
          <Link to="/plan/recurring" className="flex min-h-12 items-center gap-2 rounded-card bg-warning-soft px-4 text-sm font-medium text-warning">
            <Icon name="alert" size={18} />
            {H.pendingBanner((pending ?? []).length)}
          </Link>
        )}

        {primaryBank && forecast30 && (
          <section>
            <div className="flex items-center justify-between">
              <SectionTitle>{he.forecast.upcoming30}</SectionTitle>
              <Link to={`/plan/forecast?account=${primaryBank.id}&days=30`} className="min-h-11 px-1 pt-2 text-sm text-brand-text">
                {he.common.showMore}
              </Link>
            </div>
            <div className={`mb-2 flex items-center justify-between rounded-2xl px-4 py-3 ${forecast30.belowZero ? 'bg-warning-soft' : 'bg-surface'} border border-line`}>
              <span className="text-sm">
                {he.forecast.forecastBalance} · {primaryBank.name}
              </span>
              <Money agorot={forecast30.endBalance} tone={forecast30.endBalance < 0 ? 'expense' : 'plain'} className="font-medium" />
            </div>
            {forecast30.belowZero && <p className="mb-2 px-1 text-xs text-warning">{he.forecast.belowZero(formatDisplayDate(forecast30.minDate))}</p>}
            <ForecastEvents events={forecast30.events} limit={6} />
          </section>
        )}

        {reminders.length > 0 && (
          <section>
            <SectionTitle>{H.renewSoon}</SectionTitle>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {reminders.slice(0, 5).map((r) => (
                <Link key={`${r.recurringId}-${r.kind}`} to={`/plan/recurring/${r.recurringId}`} className="flex min-h-12 items-center justify-between px-4 py-2 text-sm">
                  <span>
                    {recurringById.get(r.recurringId)?.name} · <span className="text-muted">{he.recurring.reminders[r.kind]}</span>
                  </span>
                  <span className="num text-muted">{formatDisplayDate(r.date)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {active.length > 0 && (
          <section>
            <SectionTitle>{H.recent}</SectionTitle>
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

        {budget && budget.lines.some((l) => l.spent > 0) && (
          <section className="pb-2">
            <div className="flex items-center justify-between">
              <SectionTitle>{H.topCategories}</SectionTitle>
              <Link to="/plan/budget" className="min-h-11 px-1 pt-2 text-sm text-brand-text">
                {he.common.showMore}
              </Link>
            </div>
            <Card className="flex flex-col gap-3">
              {budget.lines
                .filter((l) => l.spent > 0)
                .slice(0, 5)
                .map((l) => (
                  <div key={l.categoryId} className="flex flex-col gap-1">
                    <div className="flex justify-between text-sm">
                      <span>{categoryLabel(categories.get(l.categoryId), categories)}</span>
                      <span className="flex gap-1">
                        <Money agorot={l.spent} />
                        {l.budget !== null && (
                          <span className="text-muted">
                            / <Money agorot={l.budget} />
                          </span>
                        )}
                      </span>
                    </div>
                    {l.budget !== null && <ProgressBar usedBp={l.usedBp} state={l.state} label={categoryLabel(categories.get(l.categoryId), categories)} />}
                  </div>
                ))}
            </Card>
          </section>
        )}
      </div>
    </>
  );
}
