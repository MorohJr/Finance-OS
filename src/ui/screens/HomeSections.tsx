import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Account, Card as CardT, Category, Institution, NetWorthSnapshot, Payee, Transaction } from '../../domain/schemas';
import type { CardStatus } from '../../calc/cards';
import type { BudgetSummary } from '../../calc/budget';
import type { Forecast } from '../../calc/forecast';
import type { FlowOptions } from '../../calc/cashflow';
import type { NetWorth } from '../../calc/netWorth';
import type { Portfolio } from '../../calc/investments';
import type { FundView } from '../../calc/pension';
import type { BusinessOverview } from '../../calc/business/overview';
import type { WishStatus } from '../../calc/wish';
import type { Business, TaxSettings, WishItem } from '../../domain/schemas';
import { assetAllocation, categoryChanges, dailySpending, incomeVsExpense, lastMonths, pensionTotals, seriesChange, sharesOf, topPayees, type Insight } from '../../calc/dashboard';
import { balanceSeries } from '../../calc/balance';
import { monthRange, summarizeFlows } from '../../calc/cashflow';
import { netWorthSeries, topWithOther } from '../../calc/reports';
import { addDays, formatDisplayDate } from '../../calc/dates';
import { formatAgorot, formatBp, formatBpWhole } from '../../calc/money';
import { Card, SectionTitle } from '../components/Card';
import { Money } from '../components/Money';
import { Monogram } from '../components/Monogram';
import { ProgressBar } from '../components/ProgressBar';
import { ForecastEvents } from '../components/ForecastEvents';
import { AreaLine, CHART_COLORS, DayBars, Donut, PairBars, Sparkline, StackBar, StepLine } from '../components/MiniCharts';
import { categoryLabel } from '../data';
import { he } from '../strings.he';

const D = he.dash;
const short = (a: number) => formatAgorot(a, { hideAgorot: true });
/** A share too small to round to 1% still shows as present. */
const sharePct = (bp: number) => (bp > 0 && bp < 50 ? '<1%' : formatBpWhole(bp));

function MoreLink({ to }: { to: string }) {
  return (
    <Link to={to} className="min-h-11 px-1 pt-2 text-sm text-brand-text">
      {he.common.showMore}
    </Link>
  );
}

function Head({ title, to, extra }: { title: string; to?: string; extra?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
      <h3 className="font-medium">{title}</h3>
      {extra ?? (to ? <Link to={to} className="text-brand-text">{he.common.showMore}</Link> : null)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insights (option 7)
// ---------------------------------------------------------------------------

const TONE_BORDER = { warning: 'border-s-warning', info: 'border-s-brand', good: 'border-s-income' } as const;

export function InsightsSection({ insights, categories }: { insights: readonly Insight[]; categories: Map<string, Category> }) {
  if (!insights.length) return null;
  const cat = (id: string) => categoryLabel(categories.get(id), categories);
  const row = (i: Insight): { to: string; title: string; body?: string; amount?: number } => {
    switch (i.kind) {
      case 'forecast_low':
        return { to: '/plan/forecast', title: D.insight.forecast_low(i.accountName, formatDisplayDate(i.date), short(i.balance)) };
      case 'card_charge':
        return { to: '/accounts', title: D.insight.card_charge(i.cardName, formatDisplayDate(i.date)), body: i.covered ? D.insight.card_covered : D.insight.card_not_covered, amount: i.amount };
      case 'vat_due':
        return { to: '/business', title: D.insight.vat_due(formatDisplayDate(i.date)), amount: i.amount };
      case 'budget_over':
        return { to: '/plan/budget', title: D.insight.budget_over(cat(i.categoryId), formatBpWhole(i.usedBp)) };
      case 'above_usual':
        return { to: '/plan/budget', title: D.insight.above_usual(cat(i.categoryId), formatBpWhole(i.overBp)), body: D.insight.above_usual_body(short(i.current), short(i.average)) };
      case 'renewal':
        return { to: '/plan/recurring', title: D.insight.renewal(i.name, he.recurring.reminders[i.reminder], formatDisplayDate(i.date)), amount: i.amount };
      case 'savings_rate':
        return { to: '/reports', title: i.rateBp >= 0 ? D.insight.savings_good(formatBpWhole(i.rateBp)) : D.insight.savings_bad(formatBpWhole(-i.rateBp)) };
    }
  };
  return (
    <section>
      <SectionTitle>{D.insights}</SectionTitle>
      <ul className="flex flex-col gap-2">
        {insights.map((i, idx) => {
          const r = row(i);
          return (
            <li key={`${i.kind}-${idx}`}>
              <Link to={r.to} className={`flex items-center gap-3 rounded-2xl border border-s-4 border-line bg-surface px-4 py-3 active:bg-surface-2 ${TONE_BORDER[i.tone]}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{r.title}</span>
                  {r.body && <span className="block text-xs text-muted">{r.body}</span>}
                </span>
                {r.amount !== undefined && <Money agorot={r.amount} className="shrink-0 text-sm font-medium" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Carousels (option 4)
// ---------------------------------------------------------------------------

function Carousel({ title, to, children }: { title: string; to: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <SectionTitle>{title}</SectionTitle>
        <MoreLink to={to} />
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label={`${title} · ${D.swipe}`} role="group">
        {children}
      </div>
    </section>
  );
}

export function CardsCarousel({ cards, data, institutions }: { cards: readonly CardT[]; data: { data: { card: CardT }; status: CardStatus }[] | undefined; institutions: Map<string, Institution> }) {
  const active = cards.filter((c) => c.status === 'active');
  if (!active.length) return null;
  return (
    <Carousel title={he.home.cards} to="/accounts">
      {active.map((c, i) => {
        const status = data?.find((d) => d.data.card.id === c.id)?.status;
        const issuer = institutions.get(c.issuerId);
        const pct = status?.utilizationBp == null ? null : Math.min(100, Math.max(0, Math.round(status.utilizationBp / 100)));
        return (
          <Link key={c.id} to={`/cards/${c.id}`} className={`flex w-[68%] max-w-64 shrink-0 snap-start flex-col gap-1.5 rounded-card p-4 text-on-brand ${i % 2 ? 'bg-brand-strong' : 'bg-brand'}`}>
            <span className="flex items-center gap-2">
              <Monogram name={issuer?.name ?? c.name} color={issuer?.color} size={28} logoId={c.logoAttachmentId ?? issuer?.logoAttachmentId} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
              <span className="num text-xs text-on-brand-muted">·· {c.last4}</span>
            </span>
            {c.kind === 'credit' && status?.nextCharge ? (
              <>
                <Money agorot={status.nextCharge.total} className="text-xl font-bold" />
                <span className="text-xs text-on-brand-muted">{he.cards.chargeOn(formatDisplayDate(status.nextCharge.chargeDate))}</span>
              </>
            ) : (
              <span className="py-2 text-sm text-on-brand-muted">{c.kind === 'debit' ? he.cards.debit : he.cards.noCharge}</span>
            )}
            {pct !== null && (
              <span className="mt-1 block h-1.5 rounded-full bg-white/25" role="meter" aria-label={he.cards.utilization} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span className="block h-1.5 rounded-full bg-white" style={{ width: `${pct}%` }} />
              </span>
            )}
          </Link>
        );
      })}
    </Carousel>
  );
}

export function AccountsCarousel({ accounts, balances, txs, institutions, today }: { accounts: readonly Account[]; balances: Map<string, number>; txs: readonly Transaction[]; institutions: Map<string, Institution>; today: string }) {
  const from = addDays(today, -90);
  const series = useMemo(() => new Map(accounts.map((a) => [a.id, balanceSeries(a.id, txs, from, today).map((p) => p.balance)])), [accounts, txs, from, today]);
  if (!accounts.length) return null;
  return (
    <Carousel title={he.home.accounts} to="/accounts">
      {accounts.map((a) => {
        const inst = a.institutionId ? institutions.get(a.institutionId) : undefined;
        const bal = balances.get(a.id) ?? 0;
        const s = series.get(a.id) ?? [];
        const up = s.length < 2 || s[s.length - 1]! >= s[0]!;
        return (
          <Link key={a.id} to={`/accounts/${a.id}`} className="flex w-[42%] max-w-44 shrink-0 snap-start flex-col gap-1 rounded-card border border-line bg-surface p-3 active:bg-surface-2">
            <span className="flex items-center gap-2">
              <Monogram name={inst?.name ?? a.name} color={a.color ?? inst?.color} size={24} logoId={a.logoAttachmentId ?? inst?.logoAttachmentId} />
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{a.name}</span>
            </span>
            <Money agorot={bal} tone={bal < 0 ? 'expense' : 'plain'} className="font-bold" />
            <Sparkline values={s} label={a.name} color={up ? 'var(--income)' : 'var(--expense)'} width={120} />
          </Link>
        );
      })}
    </Carousel>
  );
}

// ---------------------------------------------------------------------------
// Tabs (option 3) holding options 1, 2, 5 and 6
// ---------------------------------------------------------------------------

type Tab = 'month' | 'assets' | 'future' | 'business';
const TAB_KEY = 'home-tab';

function readTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return v === 'assets' || v === 'future' || v === 'business' ? v : 'month';
  } catch {
    return 'month';
  }
}

export interface TabsData {
  today: string;
  txs: readonly Transaction[];
  flowOptions: Pick<FlowOptions, 'spread' | 'interestPart'>;
  categories: Map<string, Category>;
  payees: Map<string, Payee>;
  budget?: BudgetSummary;
  nw: NetWorth;
  snapshots: readonly NetWorthSnapshot[];
  portfolio?: Portfolio;
  pension?: readonly FundView[];
  forecast?: Forecast;
  forecastAccount?: Account;
  wishes?: readonly { item: WishItem; status: WishStatus }[];
  business?: Business | null;
  bizOverview?: BusinessOverview | null;
  tax?: TaxSettings;
}

export function DashboardTabs(p: TabsData) {
  const [tab, setTab] = useState<Tab>(readTab);
  const tabs: Tab[] = p.business && p.bizOverview ? ['month', 'assets', 'future', 'business'] : ['month', 'assets', 'future'];
  const current = tabs.includes(tab) ? tab : 'month';
  const choose = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // Private mode: the tab just isn't remembered.
    }
  };
  return (
    <section className="flex flex-col gap-3">
      <div role="tablist" aria-label={D.tabsLabel} className="flex gap-1 rounded-full bg-surface p-1">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={current === t} aria-controls={`panel-${t}`} onClick={() => choose(t)} className={`min-h-10 flex-1 rounded-full text-sm font-medium ${current === t ? 'bg-brand text-on-brand' : 'text-muted'}`}>
            {D.tabs[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`} className="flex flex-col gap-3">
        {current === 'month' && <MonthTab {...p} />}
        {current === 'assets' && <AssetsTab {...p} />}
        {current === 'future' && <FutureTab {...p} />}
        {current === 'business' && <BusinessTab {...p} />}
      </div>
    </section>
  );
}

function MonthTab({ today, txs, flowOptions, categories, payees, budget }: TabsData) {
  const month = today.slice(0, 7);
  const data = useMemo(() => {
    const months = lastMonths(month, 6);
    const bars = incomeVsExpense(txs, months, flowOptions);
    const daily = dailySpending(txs, month, today, flowOptions);
    const summary = summarizeFlows(txs, { ...flowOptions, ...monthRange(month) });
    const donut = sharesOf(topWithOther(summary.expenseByCategory, 4));
    const changes = categoryChanges(txs, today, flowOptions).slice(0, 4);
    const payers = topPayees(txs, monthRange(month).from, today, 3);
    return { bars, daily, donut, changes, payers, total: summary.expense };
  }, [txs, flowOptions, month, today]);
  const catName = (id: string) => (id === '__other__' ? he.reports.other : id === '__uncategorized__' ? he.home.uncategorized : categoryLabel(categories.get(id), categories));

  return (
    <>
      <Card>
        <Head title={D.incomeVsExpense} extra={<span className="text-xs text-muted">{D.sixMonths}</span>} />
        <PairBars label={D.incomeVsExpense} data={data.bars.map((b) => ({ key: b.month, a: b.income, b: b.expense, caption: b.month.slice(5) }))} />
        <p className="mt-2 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-income" />{D.income}</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-expense" />{D.expense}</span>
        </p>
      </Card>

      <Card>
        <Head title={D.dailySpending} extra={<span className="text-xs text-muted">{D.dailyAverage(short(data.daily.average))}</span>} />
        <DayBars label={D.dailySpending} values={data.daily.days.map((d) => d.expense)} totalDays={data.daily.daysInMonth} />
      </Card>

      {data.donut.length > 0 && (
        <Card>
          <Head title={D.whereMoneyWent} extra={<Money agorot={data.total} className="text-sm text-muted" />} />
          <div className="flex items-center gap-4">
            <Donut label={D.whereMoneyWent} parts={data.donut.map((d, i) => ({ key: d.categoryId, shareBp: d.shareBp, color: CHART_COLORS[i % CHART_COLORS.length]! }))} />
            <ul className="min-w-0 flex-1 text-sm">
              {data.donut.map((d, i) => (
                <li key={d.categoryId} className="flex items-center gap-2 py-0.5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate">{catName(d.categoryId)}</span>
                  <span className="num text-muted">{sharePct(d.shareBp)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {data.changes.length > 0 && (
        <Card>
          <Head title={D.vsLastMonth} to="/reports" />
          <ul className="divide-y divide-line text-sm">
            {data.changes.map((c) => (
              <li key={c.categoryId} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">{catName(c.categoryId)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Money agorot={c.current} className="text-muted" />
                  <span className={`num w-16 text-end font-medium ${c.deltaBp === null ? 'text-muted' : c.delta > 0 ? 'text-expense' : c.delta < 0 ? 'text-income' : 'text-muted'}`}>
                    {c.deltaBp === null ? D.newThisMonth : `${c.delta > 0 ? '▲' : c.delta < 0 ? '▼' : ''} ${formatBpWhole(Math.abs(c.deltaBp))}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.payers.length > 0 && (
        <Card>
          <Head title={D.topPayees} to="/transactions" />
          <ul className="divide-y divide-line text-sm">
            {data.payers.map((x) => (
              <li key={x.payeeId} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">{payees.get(x.payeeId)?.name ?? '—'}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Money agorot={x.amount} className="font-medium" />
                  <span className="num w-8 text-end text-xs text-muted">{D.times(x.count)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {budget && budget.lines.some((l) => l.spent > 0 && l.budget !== null) && (
        <Card className="flex flex-col gap-3">
          <Head title={D.budgetByCategory} to="/plan/budget" />
          {budget.lines
            .filter((l) => l.spent > 0 && l.budget !== null)
            .slice(0, 4)
            .map((l) => (
              <div key={l.categoryId} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span>{catName(l.categoryId)}</span>
                  <span className="flex gap-1">
                    <Money agorot={l.spent} />
                    <span className="text-muted">
                      / <Money agorot={l.budget!} />
                    </span>
                  </span>
                </div>
                <ProgressBar usedBp={l.usedBp} state={l.state} label={catName(l.categoryId)} />
              </div>
            ))}
        </Card>
      )}
    </>
  );
}

function AssetsTab({ today, nw, snapshots, portfolio, pension }: TabsData) {
  const month = today.slice(0, 7);
  const trend = useMemo(() => netWorthSeries(snapshots, { month, netWorth: nw.netWorth, assets: nw.assets, liabilities: nw.liabilities }).slice(-12).map((r) => r.netWorth), [snapshots, month, nw]);
  const trendChange = seriesChange(trend);
  const secTrend = useMemo(() => [...snapshots.filter((s) => !s.deletedAt && s.month !== month).map((s) => (typeof s.breakdown.securities === 'number' ? s.breakdown.securities : 0)), nw.breakdown.securities].slice(-12), [snapshots, month, nw]);
  const alloc = assetAllocation(nw);
  const pens = pension?.length ? pensionTotals(pension) : undefined;
  const topPositions = (portfolio?.positions ?? []).filter((x) => x.qty > 0n && x.unrealizedBp !== null).sort((a, b) => (b.unrealizedBp ?? 0) - (a.unrealizedBp ?? 0)).slice(0, 3);

  return (
    <>
      <Card>
        <Head title={D.netWorth12} extra={trendChange.deltaBp !== null ? <span className={`num text-xs font-medium ${trendChange.delta >= 0 ? 'text-income' : 'text-expense'}`}>{trendChange.delta >= 0 ? '+' : '−'}{formatBpWhole(Math.abs(trendChange.deltaBp))}</span> : undefined} />
        {trend.length > 1 ? <AreaLine values={trend} label={D.netWorth12} /> : <p className="text-sm text-muted">{D.empty}</p>}
      </Card>

      {alloc.length > 0 && (
        <Card>
          <Head title={D.allocation} extra={<Money agorot={nw.assets} className="text-sm text-muted" />} />
          <StackBar label={D.allocation} parts={alloc.map((a, i) => ({ key: a.key, shareBp: a.shareBp, color: CHART_COLORS[i % CHART_COLORS.length]! }))} />
          <ul className="mt-2 flex flex-col text-sm">
            {alloc.map((a, i) => (
              <li key={a.key} className="flex items-center gap-2 py-0.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate">{D.allocationKeys[a.key]}</span>
                <span className="num text-muted">{sharePct(a.shareBp)}</span>
                <Money agorot={a.amount} className="w-28 text-end font-medium" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {portfolio && portfolio.totalValue > 0 && (
        <Card>
          <Head title={D.portfolio} to="/investments" />
          <div className="flex items-baseline justify-between">
            <Money agorot={portfolio.totalValue} className="text-xl font-bold" />
            <span className="text-sm">
              <Money agorot={portfolio.unrealized} tone={portfolio.unrealized >= 0 ? 'income' : 'expense'} />
              {portfolio.unrealizedBp !== null && <span className="num text-muted"> ({formatBp(portfolio.unrealizedBp)})</span>}
            </span>
          </div>
          {secTrend.length > 1 && <AreaLine values={secTrend} label={D.portfolio} color="#16A394" height={48} />}
          <ul className="mt-1 divide-y divide-line text-sm">
            {topPositions.map((x) => (
              <li key={x.security.id} className="flex justify-between py-1.5">
                <span className="truncate">{x.security.name}</span>
                <span className={`num ${x.unrealized >= 0 ? 'text-income' : 'text-expense'}`}>{formatBpWhole(x.unrealizedBp!)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pens && pens.balance > 0 && (
        <Link to="/pension" className="block rounded-card border border-line bg-surface p-4 active:bg-surface-2">
          <span className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{D.pension}</span>
            <Money agorot={pens.balance} className="font-bold" />
          </span>
          <span className="mt-1 block text-xs text-muted">{D.depositsYtd(short(pens.depositsYtd))}</span>
        </Link>
      )}
    </>
  );
}

function FutureTab({ forecast, forecastAccount, wishes }: TabsData) {
  const active = (wishes ?? []).filter((w) => w.item.status === 'active');
  return (
    <>
      {forecast && forecastAccount && (
        <Card>
          <Head title={D.forecast} extra={<span className="text-xs text-muted">{forecastAccount.name}</span>} />
          <StepLine label={D.forecast} values={forecast.series.map((s) => s.balance)} />
          <div className="mt-2 flex items-baseline justify-between text-sm">
            <span className={forecast.belowZero ? 'text-warning' : 'text-muted'}>{D.lowPoint(short(forecast.minBalance), formatDisplayDate(forecast.minDate))}</span>
            <Money agorot={forecast.endBalance} tone={forecast.endBalance < 0 ? 'expense' : 'plain'} className="font-medium" />
          </div>
        </Card>
      )}
      {forecast && forecastAccount && (
        <section>
          <div className="flex items-center justify-between">
            <SectionTitle>{D.upcoming}</SectionTitle>
            <MoreLink to={`/plan/forecast?account=${forecastAccount.id}&days=30`} />
          </div>
          {forecast.events.length ? <ForecastEvents events={forecast.events} limit={6} /> : <Card><p className="text-sm text-muted">{D.noUpcoming}</p></Card>}
        </section>
      )}
      {active.length > 0 && (
        <Card className="flex flex-col gap-3">
          <Head title={he.home.wishes} to="/plan/wish" />
          {active.slice(0, 3).map((w) => (
            <Link key={w.item.id} to={`/plan/wish/${w.item.id}`} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span>{w.item.name}</span>
                <span className="flex gap-1">
                  <Money agorot={w.status.savedOrPaid} />
                  <span className="text-muted">
                    / <Money agorot={w.item.priceAgorot} />
                  </span>
                </span>
              </div>
              <ProgressBar usedBp={w.status.progressBp} state={w.status.label === 'behind' ? 'near' : 'ok'} label={w.item.name} />
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}

function BusinessTab({ business, bizOverview, tax }: TabsData) {
  if (!business || !bizOverview) return null;
  return (
    <Card className="flex flex-col gap-3">
      <Head title={business.name} to="/business" />
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted">{he.business.incomeThisMonth}</p>
          <Money agorot={bizOverview.incomeThisMonth} className="font-medium" />
        </div>
        <div>
          <p className="text-xs text-muted">{he.business.setAsideYtd}</p>
          <Money agorot={bizOverview.setAsideYtd} className="font-medium" />
        </div>
        {bizOverview.currentVat && (
          <div>
            <p className="text-xs text-muted">{he.business.vatThisPeriod}</p>
            <Money agorot={bizOverview.currentVat.vatDue} className="font-medium" />
          </div>
        )}
        {bizOverview.patur && tax && (
          <div className="col-span-2 flex flex-col gap-1">
            <p className="text-xs text-muted">
              {he.business.turnover} <Money agorot={bizOverview.patur.turnoverYtd} /> / <Money agorot={tax.paturCeilingAgorot} />
            </p>
            <ProgressBar usedBp={bizOverview.patur.pctOfCeilingBp} state={bizOverview.patur.alerts.includes('over') ? 'over' : bizOverview.patur.alerts.length ? 'near' : 'ok'} label={he.business.patur} />
          </div>
        )}
      </div>
    </Card>
  );
}
