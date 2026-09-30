import type { NetWorthSnapshot } from '../domain/schemas';
import { summarizeFlows, monthRange, type FlowOptions, type FlowSummary } from './cashflow';
import { addMonths } from './dates';
import { BP_SCALE, divRoundHalfUp, sumAgorot } from './money';

/** Reports (SPEC 7.3 "דוחות", 10.12): the same flow calculation over months, quarters and years. */

export type PeriodKind = 'month' | 'quarter' | 'year';

export interface Period {
  kind: PeriodKind;
  from: string;
  to: string;
  /** Anchor for navigation: YYYY-MM (month), YYYY-Qn (quarter), YYYY (year). */
  key: string;
}

export function periodOf(kind: PeriodKind, date: string): Period {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  if (kind === 'month') {
    const key = date.slice(0, 7);
    return { kind, key, ...monthRange(key) };
  }
  if (kind === 'quarter') {
    const q = Math.floor((m - 1) / 3) + 1;
    const first = `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}`;
    return { kind, key: `${y}-Q${q}`, from: `${first}-01`, to: monthRange(addMonths(`${first}-01`, 2).slice(0, 7)).to };
  }
  return { kind, key: y, from: `${y}-01-01`, to: `${y}-12-31` };
}

export function shiftPeriod(p: Period, delta: number): Period {
  const months = p.kind === 'month' ? 1 : p.kind === 'quarter' ? 3 : 12;
  return periodOf(p.kind, addMonths(p.from, delta * months));
}

type Txs = Parameters<typeof summarizeFlows>[0];
type Opts = Omit<FlowOptions, 'from' | 'to'>;

export function periodSummary(txs: Txs, p: Period, opts: Opts): FlowSummary {
  return summarizeFlows(txs, { ...opts, from: p.from, to: p.to });
}

export interface MonthPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
}

/** Income, expense and net per month of a year (trend chart). */
export function monthlySeries(txs: Txs, year: string, opts: Opts): MonthPoint[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const s = summarizeFlows(txs, { ...opts, ...monthRange(month) });
    return { month, income: s.income, expense: s.expense, net: s.net };
  });
}

export interface CategoryDelta {
  categoryId: string;
  a: number;
  b: number;
  delta: number;
  /** delta ÷ a in bp; null when there was nothing in year A. */
  deltaBp: number | null;
}

/** Year comparison (7.3): expense per category in year A vs year B, largest change first. */
export function compareYears(txs: Txs, yearA: string, yearB: string, opts: Opts): { a: FlowSummary; b: FlowSummary; categories: CategoryDelta[] } {
  const a = summarizeFlows(txs, { ...opts, from: `${yearA}-01-01`, to: `${yearA}-12-31` });
  const b = summarizeFlows(txs, { ...opts, from: `${yearB}-01-01`, to: `${yearB}-12-31` });
  const ids = new Set([...a.expenseByCategory.keys(), ...b.expenseByCategory.keys()]);
  const categories = [...ids]
    .map((categoryId) => {
      const va = a.expenseByCategory.get(categoryId) ?? 0;
      const vb = b.expenseByCategory.get(categoryId) ?? 0;
      return { categoryId, a: va, b: vb, delta: vb - va, deltaBp: va > 0 ? divRoundHalfUp((vb - va) * BP_SCALE, va) : null };
    })
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return { a, b, categories };
}

/** Years that have data, newest first (10.12: derived from the data, not fixed). */
export function yearsWithData(dates: readonly string[], current: string): string[] {
  const set = new Set(dates.map((d) => d.slice(0, 4)));
  set.add(current.slice(0, 4));
  return [...set].sort().reverse();
}

/** Net worth over time: stored monthly snapshots plus the live value for the current month. */
export function netWorthSeries(snapshots: readonly Pick<NetWorthSnapshot, 'month' | 'netWorth' | 'assets' | 'liabilities' | 'deletedAt'>[], current?: { month: string; netWorth: number; assets: number; liabilities: number }) {
  const rows = snapshots.filter((s) => !s.deletedAt).map((s) => ({ month: s.month, netWorth: s.netWorth, assets: s.assets, liabilities: s.liabilities }));
  if (current && !rows.some((r) => r.month === current.month)) rows.push(current);
  return rows.sort((a, b) => a.month.localeCompare(b.month));
}

/** Top categories with an "other" bucket, for charts. */
export function topWithOther(byCategory: ReadonlyMap<string, number>, n: number): { categoryId: string; amount: number }[] {
  const sorted = [...byCategory.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, n).map(([categoryId, amount]) => ({ categoryId, amount }));
  const rest = sumAgorot(sorted.slice(n).map(([, v]) => v));
  return rest > 0 ? [...top, { categoryId: '__other__', amount: rest }] : top;
}
