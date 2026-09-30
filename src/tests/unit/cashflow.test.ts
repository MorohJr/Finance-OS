import { describe, expect, it } from 'vitest';
import { UNCATEGORIZED, monthRange, nextMonth, previousMonth, summarizeFlows } from '../../calc/cashflow';
import { tx } from './fixtures';

const range = { from: '2026-09-01', to: '2026-09-30' };

describe('summarizeFlows', () => {
  it('refund reduces expense in its category; uncategorized still counts', () => {
    const s = summarizeFlows(
      [
        tx({ kind: 'expense', amountAgorot: 10_000, accountId: 'a', categoryId: 'food' }),
        tx({ kind: 'refund', amountAgorot: 2_500, accountId: 'a', categoryId: 'food' }),
        tx({ kind: 'expense', amountAgorot: 700, accountId: 'a' }),
      ],
      range,
    );
    expect(s.expense).toBe(8_200);
    expect(s.expenseByCategory.get('food')).toBe(7_500);
    expect(s.expenseByCategory.get(UNCATEGORIZED)).toBe(700);
  });

  it('card purchases count on the purchase date', () => {
    const s = summarizeFlows([tx({ kind: 'expense', amountAgorot: 5_000, cardId: 'c', date: '2026-09-20' })], range);
    expect(s.expense).toBe(5_000);
  });

  it('business income counts by net (no VAT)', () => {
    const s = summarizeFlows(
      [
        tx({
          kind: 'income',
          amountAgorot: 590_000,
          accountId: 'a',
          context: 'business',
          business: { netAgorot: 500_000, vatAgorot: 90_000, incomeTaxReserveAgorot: 0, niReserveAgorot: 0 },
        }),
      ],
      range,
    );
    expect(s.income).toBe(500_000);
  });

  it('VAT payments are not expenses (income is counted without VAT)', async () => {
    const { SYSTEM_CATEGORY_IDS } = await import('../../db/seed.data');
    const s = summarizeFlows([tx({ kind: 'expense', amountAgorot: 174_000, accountId: 'a', context: 'business', categoryId: SYSTEM_CATEGORY_IDS.vatPayment })], range);
    expect(s.expense).toBe(0);
  });

  it('context filter and date range', () => {
    const txs = [
      tx({ kind: 'expense', amountAgorot: 100, accountId: 'a', context: 'business' }),
      tx({ kind: 'expense', amountAgorot: 200, accountId: 'a', context: 'personal' }),
      tx({ kind: 'expense', amountAgorot: 400, accountId: 'a', date: '2026-10-01' }),
    ];
    expect(summarizeFlows(txs, { ...range, context: 'personal' }).expense).toBe(200);
    expect(summarizeFlows(txs, { ...range, context: 'business' }).expense).toBe(100);
    expect(summarizeFlows(txs, range).expense).toBe(300);
  });

  it('ratios in bp, null without income', () => {
    const s = summarizeFlows(
      [tx({ kind: 'income', amountAgorot: 10_000, accountId: 'a' }), tx({ kind: 'expense', amountAgorot: 7_500, accountId: 'a' })],
      range,
    );
    expect(s.expenseRatioBp).toBe(7_500);
    expect(s.savingsRateBp).toBe(2_500);
    expect(summarizeFlows([], range).savingsRateBp).toBeNull();
  });

  it('loan payment counts only its interest part', () => {
    const t = tx({ kind: 'loan_payment', amountAgorot: 152_110, accountId: 'a' });
    const s = summarizeFlows([t], { ...range, interestPart: () => 25_000 });
    expect(s.expense).toBe(25_000);
  });
});

describe('installments (10.3)', () => {
  const purchase = tx({ kind: 'expense', amountAgorot: 100_000, cardId: 'c', date: '2026-03-20', categoryId: 'tv' });
  const charges = [
    { transactionId: purchase.id, chargeDate: '2026-04-10', amountAgorot: 33_334 },
    { transactionId: purchase.id, chargeDate: '2026-05-10', amountAgorot: 33_333 },
    { transactionId: purchase.id, chargeDate: '2026-06-10', amountAgorot: 33_333 },
  ];
  it('upfront: the whole purchase in the purchase month', () => {
    expect(summarizeFlows([purchase], { from: '2026-03-01', to: '2026-03-31' }).expense).toBe(100_000);
  });
  it('spread: each charge in its charge month (DECISION 15.3 default)', () => {
    const spread = { transactionIds: new Set([purchase.id]), charges };
    expect(summarizeFlows([purchase], { from: '2026-03-01', to: '2026-03-31', spread }).expense).toBe(0);
    const april = summarizeFlows([purchase], { from: '2026-04-01', to: '2026-04-30', spread });
    expect(april.expense).toBe(33_334);
    expect(april.expenseByCategory.get('tv')).toBe(33_334);
  });
});

describe('months', () => {
  it('ranges and navigation', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02').to).toBe('2028-02-29');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });
});
