import { describe, expect, it } from 'vitest';
import { compareYears, monthlySeries, netWorthSeries, periodOf, periodSummary, shiftPeriod, topWithOther, yearsWithData } from '../../calc/reports';
import { tx } from './fixtures';

describe('reports (7.3, 10.12)', () => {
  it('periods and navigation', () => {
    expect(periodOf('quarter', '2026-08-15')).toEqual({ kind: 'quarter', key: '2026-Q3', from: '2026-07-01', to: '2026-09-30' });
    expect(shiftPeriod(periodOf('quarter', '2026-02-01'), -1).key).toBe('2025-Q4');
    expect(shiftPeriod(periodOf('month', '2026-12-05'), 1)).toMatchObject({ key: '2027-01', to: '2027-01-31' });
    expect(periodOf('year', '2026-05-05')).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
  });

  const txs = [
    tx({ kind: 'income', amountAgorot: 1_000_000, accountId: 'a', date: '2025-03-09' }),
    tx({ kind: 'expense', amountAgorot: 300_000, accountId: 'a', date: '2025-03-10', categoryId: 'food' }),
    tx({ kind: 'income', amountAgorot: 1_200_000, accountId: 'a', date: '2026-03-09' }),
    tx({ kind: 'expense', amountAgorot: 450_000, accountId: 'a', date: '2026-03-10', categoryId: 'food' }),
    tx({ kind: 'expense', amountAgorot: 50_000, accountId: 'a', date: '2026-04-10', categoryId: 'fun' }),
    tx({ kind: 'transfer', amountAgorot: 999_999, accountId: 'a', toAccountId: 'b', date: '2026-04-11' }),
  ];

  it('quarter summary uses the same flow rules (transfers excluded)', () => {
    const s = periodSummary(txs, periodOf('quarter', '2026-04-01'), {});
    expect(s.income).toBe(0);
    expect(s.expense).toBe(50_000);
    expect(periodSummary(txs, periodOf('year', '2026-01-01'), {}).savingsRateBp).toBe(5_833); // (12,000 − 5,000) / 12,000
  });

  it('monthly series has 12 months', () => {
    const s = monthlySeries(txs, '2026', {});
    expect(s).toHaveLength(12);
    expect(s[2]).toEqual({ month: '2026-03', income: 1_200_000, expense: 450_000, net: 750_000 });
  });

  it('year comparison by category', () => {
    const c = compareYears(txs, '2025', '2026', {});
    expect(c.categories[0]).toEqual({ categoryId: 'food', a: 300_000, b: 450_000, delta: 150_000, deltaBp: 5_000 });
    expect(c.categories.find((x) => x.categoryId === 'fun')?.delta).toBe(50_000);
  });

  it('years derived from data; net worth series; top with other', () => {
    expect(yearsWithData(['2024-01-01', '2026-05-01'], '2026-09-30')).toEqual(['2026', '2024']);
    expect(netWorthSeries([{ month: '2026-08', netWorth: 5, assets: 5, liabilities: 0 }], { month: '2026-09', netWorth: 7, assets: 7, liabilities: 0 }).map((r) => r.month)).toEqual(['2026-08', '2026-09']);
    expect(topWithOther(new Map([['a', 5], ['b', 4], ['c', 3], ['d', 2]]), 2)).toEqual([
      { categoryId: 'a', amount: 5 },
      { categoryId: 'b', amount: 4 },
      { categoryId: '__other__', amount: 5 },
    ]);
  });
});
