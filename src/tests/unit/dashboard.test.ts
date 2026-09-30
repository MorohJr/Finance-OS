import { describe, expect, it } from 'vitest';
import { pensionTotals, seriesChange, sharesOf, assetAllocation, buildInsights, categoriesAboveUsual, categoryChanges, dailySpending, incomeVsExpense, lastMonths, topPayees, type InsightInput } from '../../calc/dashboard';
import { computeNetWorth } from '../../calc/netWorth';
import { ils, tx } from './fixtures';

const exp = (amount: number, date: string, categoryId = 'food', payeeId?: string) => tx({ kind: 'expense', amountAgorot: ils(amount), date, categoryId, accountId: 'a', payeeId });
const inc = (amount: number, date: string) => tx({ kind: 'income', amountAgorot: ils(amount), date, categoryId: 'salary', accountId: 'a' });

describe('dashboard calculations', () => {
  it('sharesOf', () => {
    expect(sharesOf([{ amount: 300 }, { amount: 100 }, { amount: 0 }])).toEqual([{ amount: 300, shareBp: 7_500 }, { amount: 100, shareBp: 2_500 }]);
    expect(sharesOf([])).toEqual([]);
  });

  it('series change and pension totals', () => {
    expect(seriesChange([ils(1_000), ils(900), ils(1_100)])).toEqual({ delta: ils(100), deltaBp: 1_000 });
    expect(seriesChange([ils(5)])).toEqual({ delta: 0, deltaBp: null });
    expect(seriesChange([0, ils(5)])).toEqual({ delta: ils(5), deltaBp: null });
    expect(pensionTotals([{ balance: 100, depositsYtd: { total: 10 } }, { balance: 50, depositsYtd: { total: 5 } }])).toEqual({ balance: 150, depositsYtd: 15 });
  });

  it('lastMonths crosses the year', () => {
    expect(lastMonths('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('income vs expense per month', () => {
    const txs = [inc(10_000, '2026-08-09'), exp(3_000, '2026-08-20'), exp(500, '2026-09-02'), tx({ kind: 'transfer', amountAgorot: ils(9_999), date: '2026-09-03', accountId: 'a', toAccountId: 'b' })];
    expect(incomeVsExpense(txs, ['2026-08', '2026-09'], {})).toEqual([
      { month: '2026-08', income: ils(10_000), expense: ils(3_000) },
      { month: '2026-09', income: 0, expense: ils(500) },
    ]);
  });

  it('daily spending runs to today, average per elapsed day', () => {
    const txs = [exp(100, '2026-10-01'), exp(50, '2026-10-03'), exp(999, '2026-10-20')];
    const d = dailySpending(txs, '2026-10', '2026-10-04', {});
    expect(d.days.map((x) => x.expense)).toEqual([ils(100), 0, ils(50), 0]);
    expect(d.total).toBe(ils(150));
    expect(d.average).toBe(ils(37.5));
    expect(d.daysInMonth).toBe(31);
  });

  it('category change compares the same days of last month', () => {
    const txs = [exp(300, '2026-10-05', 'food'), exp(200, '2026-09-04', 'food'), exp(1_000, '2026-09-25', 'food'), exp(80, '2026-09-03', 'fuel')];
    const c = categoryChanges(txs, '2026-10-05', {});
    expect(c.find((x) => x.categoryId === 'food')).toMatchObject({ current: ils(300), previous: ils(200), delta: ils(100), deltaBp: 5_000 });
    expect(c.find((x) => x.categoryId === 'fuel')).toBeUndefined();
  });

  it('top payees: net of refunds, counted by purchases', () => {
    const txs = [exp(100, '2026-10-01', 'food', 'P1'), exp(50, '2026-10-02', 'food', 'P1'), tx({ kind: 'refund', amountAgorot: ils(30), date: '2026-10-03', accountId: 'a', payeeId: 'P1' }), exp(500, '2026-10-02', 'x', 'P2'), exp(10, '2026-09-30', 'x', 'P3')];
    expect(topPayees(txs, '2026-10-01', '2026-10-31', 5)).toEqual([
      { payeeId: 'P2', amount: ils(500), count: 1 },
      { payeeId: 'P1', amount: ils(120), count: 2 },
    ]);
  });

  it('asset allocation shares of total assets', () => {
    const nw = computeNetWorth({ accountBalances: [ils(400), -ils(50)], securitiesMarketValue: ils(100), pensionIlliquid: ils(500) });
    expect(assetAllocation(nw)).toEqual([
      { key: 'accounts', amount: ils(400), shareBp: 4_000 },
      { key: 'securities', amount: ils(100), shareBp: 1_000 },
      { key: 'pensionLocked', amount: ils(500), shareBp: 5_000 },
    ]);
    expect(assetAllocation(computeNetWorth({ accountBalances: [] }))).toEqual([]);
  });

  it('above usual: +20% and ₪200 over the 3-month average, from spending that already happened', () => {
    const txs = [
      ...['2026-07-10', '2026-08-10', '2026-09-10'].map((d) => exp(1_000, d, 'rest')),
      exp(1_300, '2026-10-03', 'rest'),
      ...['2026-07-10', '2026-08-10', '2026-09-10'].map((d) => exp(100, d, 'coffee')),
      exp(250, '2026-10-02', 'coffee'), // +150%, but only ₪150 more: not flagged
    ];
    expect(categoriesAboveUsual(txs, '2026-10-05', {})).toEqual([{ categoryId: 'rest', current: ils(1_300), average: ils(1_000), overBp: 3_000 }]);
  });

  it('insights: warnings first, only what is soon, capped', () => {
    const input: InsightInput = {
      today: '2026-10-01',
      forecast: { accountName: 'עו"ש', belowZero: true, minDate: '2026-10-12', minBalance: -ils(500) },
      cardCharges: [
        { cardName: 'אמקס', chargeDate: '2026-10-02', total: ils(6_000), billingBalance: ils(10_000) },
        { cardName: 'כאל', chargeDate: '2026-10-05', total: ils(3_000), billingBalance: ils(1_000) },
        { cardName: 'מקס', chargeDate: '2026-10-20', total: ils(900), billingBalance: ils(10_000) },
      ],
      vat: { dueDate: '2026-10-15', vatDue: ils(8_000), paid: false },
      budgetOver: [{ categoryId: 'food', usedBp: 11_000, state: 'over' }],
      aboveUsual: [{ categoryId: 'food', current: 1, average: 1, overBp: 3_000 }],
      reminders: [{ name: 'נטפליקס', date: '2026-10-06', kind: 'renewal', amount: ils(54.9) }],
      lastMonth: { month: '2026-09', savingsRateBp: 1_800 },
    };
    const all = buildInsights(input, 20);
    expect(all.map((x) => x.kind)).toEqual(['forecast_low', 'card_charge', 'budget_over', 'card_charge', 'vat_due', 'renewal', 'savings_rate']);
    expect(all[1]).toMatchObject({ cardName: 'כאל', covered: false });
    expect(all[3]).toMatchObject({ cardName: 'אמקס', covered: true });
    expect(buildInsights(input)).toHaveLength(5);
  });
});
