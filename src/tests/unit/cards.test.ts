import { describe, expect, it } from 'vitest';
import { cardStatus, computeStatements, cycleForChargeDate, cycleForDate, dueForPayment, installmentSchedule, splitInstallments, statementStatus } from '../../calc/cards';
import { addMonths } from '../../calc/dates';
import { ils, tx } from './fixtures';

const card = { id: 'card-1', chargeDay: 10, cycleCutoffDay: null, creditLimit: ils(10000), kind: 'credit' as const };

describe('golden example 14.2: card with installments', () => {
  const purchase = tx({ kind: 'expense', amountAgorot: ils(1000), cardId: card.id, date: '2026-03-20' });
  const plan = { id: 'plan-1', transactionId: purchase.id, cardId: card.id, totalAgorot: ils(1000), count: 3, firstChargeDate: cycleForDate('2026-03-20', card).chargeDate };

  it('charges: 10/04 ₪333.34, 10/05 ₪333.33, 10/06 ₪333.33', () => {
    expect(installmentSchedule(plan, card).map((c) => [c.chargeDate, c.amountAgorot])).toEqual([
      ['2026-04-10', 33_334],
      ['2026-05-10', 33_333],
      ['2026-06-10', 33_333],
    ]);
  });

  it('on 21/03: open statement 333.34, future installments 666.66, available 9,000.00', () => {
    const statements = computeStatements(card, [purchase], [plan]);
    const s = cardStatus(card, statements, new Set(), '2026-03-21');
    expect(s.openStatementTotal).toBe(33_334);
    expect(s.nextCharge).toEqual({ chargeDate: '2026-04-10', total: 33_334 });
    expect(s.futureInstallmentsTotal).toBe(66_666);
    expect(s.availableCredit).toBe(ils(9000));
    expect(s.utilizationBp).toBe(1000);
  });
});

describe('cycles (10.2)', () => {
  it('calendar month: purchase 20/03 with chargeDay 10 is charged 10/04', () => {
    expect(cycleForDate('2026-03-20', card)).toEqual({ periodStart: '2026-03-01', periodEnd: '2026-03-31', chargeDate: '2026-04-10' });
    expect(cycleForChargeDate('2026-04-10', card)).toEqual({ periodStart: '2026-03-01', periodEnd: '2026-03-31', chargeDate: '2026-04-10' });
  });

  it('cutoff day: d ≤ c closes this month, otherwise next month', () => {
    const c = { chargeDay: 2, cycleCutoffDay: 20 };
    // closes 20/03, charged on the first 2nd after: 02/04
    expect(cycleForDate('2026-03-20', c)).toEqual({ periodStart: '2026-02-21', periodEnd: '2026-03-20', chargeDate: '2026-04-02' });
    expect(cycleForDate('2026-03-21', c)).toEqual({ periodStart: '2026-03-21', periodEnd: '2026-04-20', chargeDate: '2026-05-02' });
    expect(cycleForChargeDate('2026-05-02', c)).toEqual({ periodStart: '2026-03-21', periodEnd: '2026-04-20', chargeDate: '2026-05-02' });
  });

  it('cutoff before charge day in the same month', () => {
    const c = { chargeDay: 15, cycleCutoffDay: 5 };
    expect(cycleForDate('2026-03-04', c)).toEqual({ periodStart: '2026-02-06', periodEnd: '2026-03-05', chargeDate: '2026-03-15' });
    expect(cycleForChargeDate('2026-03-15', c).periodEnd).toBe('2026-03-05');
  });

  it('year boundary', () => {
    expect(cycleForDate('2026-12-31', card).chargeDate).toBe('2027-01-10');
  });

  it('statement status', () => {
    const cy = cycleForDate('2026-03-20', card);
    expect(statementStatus(cy, false, '2026-03-31')).toBe('open');
    expect(statementStatus(cy, false, '2026-04-01')).toBe('closed');
    expect(statementStatus(cy, true, '2026-04-01')).toBe('paid');
  });
});

describe('splitInstallments', () => {
  it('first absorbs the remainder, sum is exact', () => {
    expect(splitInstallments(100, 3)).toEqual([34, 33, 33]);
    expect(splitInstallments(1_000_001, 12).reduce((a, b) => a + b)).toBe(1_000_001);
    expect(() => splitInstallments(10.5, 2)).toThrow();
  });
});

describe('statements', () => {
  it('purchases, refunds (negative), and installments go to their statement', () => {
    const a = tx({ kind: 'expense', amountAgorot: 10_000, cardId: card.id, date: '2026-03-05' });
    const r = tx({ kind: 'refund', amountAgorot: 2_500, cardId: card.id, date: '2026-03-06' });
    const b = tx({ kind: 'expense', amountAgorot: 7_000, cardId: card.id, date: '2026-04-02' });
    const other = tx({ kind: 'expense', amountAgorot: 999, cardId: 'other-card', date: '2026-03-05' });
    const pending = tx({ kind: 'expense', amountAgorot: 999, cardId: card.id, date: '2026-03-05', status: 'pending' });
    const s = computeStatements(card, [a, r, b, other, pending], []);
    expect(s.map((x) => [x.chargeDate, x.total])).toEqual([
      ['2026-04-10', 7_500],
      ['2026-05-10', 7_000],
    ]);
  });

  it('a negative statement carries its credit into the next one', () => {
    const r = tx({ kind: 'refund', amountAgorot: 5_000, cardId: card.id, date: '2026-03-06' });
    const b = tx({ kind: 'expense', amountAgorot: 7_000, cardId: card.id, date: '2026-04-02' });
    const s = computeStatements(card, [r, b], []);
    expect(s[0]!.total).toBe(-5_000);
    expect(s[1]!.carriedIn).toBe(-5_000);
    expect(s[1]!.total).toBe(2_000);
  });

  it('pinned statements (import) override the computed cycle', () => {
    const t = tx({ kind: 'expense', amountAgorot: 100, cardId: card.id, date: '2026-03-31', links: { statementId: 'st-9' } });
    const s = computeStatements(card, [t], [], (id) => (id === 'st-9' ? '2026-05-10' : undefined));
    expect(s[0]!.chargeDate).toBe('2026-05-10');
  });

  it('due for payment: charge date reached and not paid', () => {
    const a = tx({ kind: 'expense', amountAgorot: 100, cardId: card.id, date: '2026-03-05' });
    const s = computeStatements(card, [a], []);
    expect(dueForPayment(s, new Set(), '2026-04-09')).toHaveLength(0);
    expect(dueForPayment(s, new Set(), '2026-04-10')).toHaveLength(1);
    expect(dueForPayment(s, new Set(['2026-04-10']), '2026-04-11')).toHaveLength(0);
  });
});

describe('addMonths (10.4)', () => {
  it('keeps the day, clamps to month end, returns to the anchor day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });
});
