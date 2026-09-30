import { lazy, Suspense, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Form';
import { byId, categoryLabel, useCategories, useFlowOptions, useTransactions } from '../data';
import { db } from '../../db/db';
import { compareYears, monthlySeries, netWorthSeries, periodOf, periodSummary, shiftPeriod, topWithOther, yearsWithData, type PeriodKind } from '../../calc/reports';
import { UNCATEGORIZED } from '../../calc/cashflow';
import { formatDisplayDate, formatDisplayMonth, todayIL } from '../../calc/dates';
import { formatBp } from '../../calc/money';
import type { ContextFilter } from '../../calc/cashflow';
import { he } from '../strings.he';

const R = he.reports;
const TrendChart = lazy(() => import('../components/ReportCharts').then((m) => ({ default: m.TrendChart })));
const NetWorthChart = lazy(() => import('../components/ReportCharts').then((m) => ({ default: m.NetWorthChart })));

function periodLabel(kind: PeriodKind, key: string, from: string, to: string): string {
  if (kind === 'month') return formatDisplayMonth(key);
  if (kind === 'year') return key;
  return `${formatDisplayDate(from).slice(3)} – ${formatDisplayDate(to).slice(3)}`;
}

function CategoryBars({ rows, labelOf, tone }: { rows: { categoryId: string; amount: number }[]; labelOf: (id: string) => string; tone: 'income' | 'expense' }) {
  const max = rows[0]?.amount ?? 1;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.categoryId} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span className="truncate">{labelOf(r.categoryId)}</span>
            <Money agorot={r.amount} />
          </div>
          <div className="h-2 rounded-full bg-surface-2" aria-hidden="true">
            {/* Presentation only: bar length relative to the largest category. */}
            <div className={`h-2 rounded-full ${tone === 'income' ? 'bg-income' : 'bg-brand'}`} style={{ width: `${Math.max(2, Math.round((r.amount / max) * 100))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ReportsScreen() {
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') as PeriodKind) || 'month';
  const context = (params.get('context') as ContextFilter) || 'all';
  const today = todayIL();
  const period = params.get('from') ? periodOf(kind, params.get('from')!) : periodOf(kind, today);
  const txs = useTransactions();
  const flow = useFlowOptions();
  const categories = byId(useCategories());
  const snapshots = useLiveQuery(() => db.netWorthSnapshots.toArray(), []);
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: true });
  };

  const opts = useMemo(() => ({ ...flow, context }), [flow, context]);
  const summary = useMemo(() => (txs && flow ? periodSummary(txs, period, opts) : undefined), [txs, flow, period, opts]);
  const year = period.from.slice(0, 4);
  const series = useMemo(() => (txs && flow ? monthlySeries(txs, year, opts) : undefined), [txs, flow, year, opts]);
  const years = useMemo(() => yearsWithData((txs ?? []).map((t) => t.date), today), [txs, today]);
  const comparison = useMemo(() => (txs && flow && years.length > 1 ? compareYears(txs, years[1]!, years[0]!, opts) : undefined), [txs, flow, years, opts]);
  const nwSeries = useMemo(() => netWorthSeries(snapshots ?? []), [snapshots]);
  const labelOf = (id: string) => (id === '__other__' ? R.other : id === UNCATEGORIZED ? he.home.uncategorized : categoryLabel(categories.get(id), categories));

  return (
    <>
      <ScreenHeader title={R.title} back />
      <div className="flex flex-col gap-4 px-4 pb-8">
        <Segmented label={R.title} value={kind} onChange={(k) => set({ kind: k, from: period.from })} options={(['month', 'quarter', 'year'] as const).map((k) => ({ value: k, label: R.kinds[k] }))} />
        <Segmented
          label={he.transactions.filterContext}
          value={context}
          onChange={(c) => set({ context: c })}
          options={[
            { value: 'all', label: he.context.all },
            { value: 'personal', label: he.context.personal },
            { value: 'business', label: he.context.business },
          ]}
        />
        <div className="flex items-center justify-between">
          <button type="button" aria-label={R.prev} className="flex size-11 items-center justify-center rounded-full bg-surface" onClick={() => set({ from: shiftPeriod(period, -1).from })}>
            <Icon name="back" />
          </button>
          <span className="num text-lg font-bold">{periodLabel(kind, period.key, period.from, period.to)}</span>
          <button type="button" aria-label={R.next} className="flex size-11 items-center justify-center rounded-full bg-surface" onClick={() => set({ from: shiftPeriod(period, 1).from })}>
            <Icon name="chevron" />
          </button>
        </div>

        {summary && (
          <section className="grid grid-cols-3 gap-2 rounded-card bg-brand p-4 text-on-brand">
            <div>
              <p className="text-xs text-on-brand-muted">{R.income}</p>
              <Money agorot={summary.income} className="font-bold" />
            </div>
            <div>
              <p className="text-xs text-on-brand-muted">{R.expense}</p>
              <Money agorot={summary.expense} className="font-bold" />
            </div>
            <div>
              <p className="text-xs text-on-brand-muted">{R.net}</p>
              <Money agorot={summary.net} signed className="font-bold" />
            </div>
            <div className="col-span-3 flex gap-4 text-xs text-on-brand-muted">
              <span>
                {R.expenseRatio}: <span className="num text-on-brand">{summary.expenseRatioBp === null ? '—' : formatBp(summary.expenseRatioBp)}</span>
              </span>
              <span>
                {R.savingsRate}: <span className="num text-on-brand">{summary.savingsRateBp === null ? '—' : formatBp(summary.savingsRateBp)}</span>
              </span>
            </div>
          </section>
        )}

        {summary && summary.income === 0 && summary.expense === 0 && <p className="text-center text-sm text-muted">{R.empty}</p>}

        {summary && summary.expenseByCategory.size > 0 && (
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-muted">{R.byCategory}</h2>
            <CategoryBars rows={topWithOther(summary.expenseByCategory, 8)} labelOf={labelOf} tone="expense" />
          </section>
        )}
        {summary && summary.incomeByCategory.size > 0 && (
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-muted">{R.incomeByCategory}</h2>
            <CategoryBars rows={topWithOther(summary.incomeByCategory, 5)} labelOf={labelOf} tone="income" />
          </section>
        )}

        {series && series.some((m) => m.income || m.expense) && (
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="mb-2 text-sm font-medium text-muted">{R.trend(year)}</h2>
            <Suspense fallback={<div className="h-56" />}>
              <TrendChart data={series} labels={{ income: R.income, expense: R.expense }} />
            </Suspense>
          </section>
        )}

        <section className="rounded-card border border-line bg-surface p-4">
          <h2 className="mb-2 text-sm font-medium text-muted">{R.netWorth}</h2>
          {nwSeries.length > 1 ? (
            <Suspense fallback={<div className="h-48" />}>
              <NetWorthChart data={nwSeries} label={R.netWorth} />
            </Suspense>
          ) : nwSeries.length === 1 ? (
            <p className="text-sm">
              {formatDisplayMonth(nwSeries[0]!.month)}: <Money agorot={nwSeries[0]!.netWorth} className="font-medium" />
            </p>
          ) : (
            <p className="text-sm text-muted">{R.netWorthEmpty}</p>
          )}
        </section>

        {comparison && (
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-muted">
              {R.compare} · {R.compareHead(years[1]!, years[0]!)}
            </h2>
            <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
              <span />
              <span className="num text-end font-medium">{years[1]}</span>
              <span className="num text-end font-medium">{years[0]}</span>
              <span className="text-muted">{R.income}</span>
              <Money agorot={comparison.a.income} className="text-end" />
              <Money agorot={comparison.b.income} className="text-end" />
              <span className="text-muted">{R.expense}</span>
              <Money agorot={comparison.a.expense} className="text-end" />
              <Money agorot={comparison.b.expense} className="text-end" />
            </div>
            <ul className="divide-y divide-line text-sm">
              {comparison.categories.slice(0, 8).map((c) => (
                <li key={c.categoryId} className="flex min-h-10 items-center justify-between gap-2">
                  <span className="flex-1 truncate">{labelOf(c.categoryId)}</span>
                  <Money agorot={c.delta} tone={c.delta > 0 ? 'expense' : 'income'} signed className="text-xs" />
                  {c.deltaBp !== null && <span className="num w-14 text-end text-xs text-muted">{formatBp(c.deltaBp)}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
