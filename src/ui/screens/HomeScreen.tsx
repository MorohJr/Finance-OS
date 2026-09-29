import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Banner } from '../components/Banner';
import { Card, SectionTitle } from '../components/Card';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { Monogram } from '../components/Monogram';
import { TransactionRow } from '../components/TransactionRow';
import { byId, categoryLabel, useAccounts, useBalances, useCategories, useHasData, useInstitutions, usePayees, useTransactions } from '../data';
import { usePlatform, useSettings } from '../hooks';
import { isBackupDue } from '../../calc/reminders';
import { currentMonthIL, formatDisplayDate, todayIL } from '../../calc/dates';
import { monthRange, summarizeFlows, UNCATEGORIZED } from '../../calc/cashflow';
import { computeNetWorth } from '../../calc/netWorth';
import { sortTransactions } from '../../calc/transactionFilter';
import { isIos } from '../../services/platform';
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

  const active = (accounts ?? []).filter((a) => a.status === 'active');
  const nw = useMemo(() => computeNetWorth({ accountBalances: active.map((a) => balances.get(a.id) ?? 0) }), [active, balances]);
  const month = useMemo(() => summarizeFlows(txs ?? [], monthRange(currentMonthIL())), [txs]);
  const recent = useMemo(() => sortTransactions(txs ?? []).slice(0, 5), [txs]);
  const topCategories = useMemo(
    () =>
      [...month.expenseByCategory.entries()]
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    [month],
  );
  const topMax = topCategories[0]?.[1] ?? 1;

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
          <Metric label={H.budget} to="/soon/budget" />
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

        {active.length > 0 && (
          <section>
            <SectionTitle>{H.recent}</SectionTitle>
            {recent.length ? (
              <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {recent.map((t) => (
                  <TransactionRow key={t.id} t={t} accounts={accountMap} categories={categories} payees={payees} />
                ))}
              </div>
            ) : (
              <Card>
                <p className="text-sm text-muted">{H.noRecent}</p>
              </Card>
            )}
          </section>
        )}

        {topCategories.length > 0 && (
          <section className="pb-2">
            <SectionTitle>{H.topCategories}</SectionTitle>
            <Card className="flex flex-col gap-3">
              {topCategories.map(([catId, spent]) => {
                const c = catId === UNCATEGORIZED ? undefined : categories.get(catId);
                const budget = c?.monthlyBudget;
                const pct = Math.min(100, Math.round(((budget || topMax) > 0 ? spent / (budget || topMax) : 0) * 100));
                return (
                  <div key={catId}>
                    <div className="flex justify-between text-sm">
                      <span>{c ? categoryLabel(c, categories) : H.uncategorized}</span>
                      <span className="flex gap-1">
                        <Money agorot={spent} />
                        {budget ? (
                          <span className="text-muted">
                            / <Money agorot={budget} />
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-surface-2">
                      <div className={`h-2 rounded-full ${budget && spent > budget ? 'bg-expense' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>
        )}
      </div>
    </>
  );
}
