import { describe, expect, it } from 'vitest';
import { advance, monthlyNormalized, occurrences, upcomingReminders } from '../../calc/recurring';
import { computeBudget } from '../../calc/budget';
import { computeForecast } from '../../calc/forecast';
import { computeStatements } from '../../calc/cards';
import type { Card, Category, Recurring } from '../../domain/schemas';
import { tx } from './fixtures';

const ts = '2026-01-01T00:00:00.000Z';
const rec = (p: Partial<Recurring>): Recurring => ({ id: crypto.randomUUID(), createdAt: ts, updatedAt: ts, name: 'x', kind: 'bill', amountAgorot: 10_000, frequency: 'monthly', nextDueDate: '2026-10-01', status: 'active', autoCreate: false, accountId: 'bank', ...p });

describe('advance (10.4)', () => {
  it('each frequency', () => {
    expect(advance('2026-10-01', 'daily')).toBe('2026-10-02');
    expect(advance('2026-10-01', 'weekly')).toBe('2026-10-08');
    expect(advance('2026-10-01', 'monthly')).toBe('2026-11-01');
    expect(advance('2026-10-01', 'bimonthly')).toBe('2026-12-01');
    expect(advance('2026-10-01', 'quarterly')).toBe('2027-01-01');
    expect(advance('2026-10-01', 'semiannual')).toBe('2027-04-01');
    expect(advance('2026-10-01', 'yearly')).toBe('2027-10-01');
    expect(advance('2026-10-01', 'usage_based')).toBe('2026-10-01');
  });
  it('31st: last day of February, then back to the 31st', () => {
    expect(advance('2027-01-31', 'monthly', 31)).toBe('2027-02-28');
    expect(advance('2027-02-28', 'monthly', 31)).toBe('2027-03-31');
    expect(occurrences({ nextDueDate: '2026-12-31', frequency: 'bimonthly', anchorDay: 31 }, '2027-06-30')).toEqual(['2026-12-31', '2027-02-28', '2027-04-30', '2027-06-30']);
  });
  it('monthly normalization', () => {
    expect(monthlyNormalized(1_200, 'weekly')).toBe(5_200);
    expect(monthlyNormalized(10_000, 'bimonthly')).toBe(5_000);
    expect(monthlyNormalized(30_000, 'quarterly')).toBe(10_000);
    expect(monthlyNormalized(60_000, 'semiannual')).toBe(10_000);
    expect(monthlyNormalized(120_000, 'yearly')).toBe(10_000);
    expect(monthlyNormalized(100, 'yearly')).toBe(8); // 8.33 → 8
  });
  it('reminders: due lead time, trial end, commitment end', () => {
    const items = [
      rec({ name: 'arnona', nextDueDate: '2026-10-05', reminderDaysBefore: 5 }),
      rec({ kind: 'subscription', status: 'trial', trialEndDate: '2026-10-10' }),
      rec({ commitmentEndDate: '2026-11-15' }),
      rec({ status: 'inactive', renewalDate: '2026-10-02' }),
    ];
    expect(upcomingReminders(items, '2026-10-01', 30).map((r) => r.kind)).toEqual(['due', 'trial_end']);
  });
});

describe('budget (10.5)', () => {
  const cat = (p: Partial<Category>): Category => ({ id: crypto.randomUUID(), createdAt: ts, updatedAt: ts, name: 'c', type: 'expense', includeInBudget: true, context: 'personal', ...p });
  const food = cat({ monthlyBudget: 100_000 });
  const rest = cat({ monthlyBudget: 50_000 });
  const lunch = cat({ parentId: rest.id });
  const hidden = cat({ includeInBudget: false, monthlyBudget: 1 });
  const cats = [food, rest, lunch, hidden];

  it('spent = expense − refund, children roll up, states at 80%/100%', () => {
    const b = computeBudget(
      '2026-09',
      cats,
      [],
      [
        tx({ kind: 'expense', amountAgorot: 90_000, accountId: 'a', categoryId: food.id }),
        tx({ kind: 'refund', amountAgorot: 5_000, accountId: 'a', categoryId: food.id }),
        tx({ kind: 'expense', amountAgorot: 60_000, accountId: 'a', categoryId: lunch.id }),
        tx({ kind: 'expense', amountAgorot: 7_000, accountId: 'a', categoryId: hidden.id }),
        tx({ kind: 'expense', amountAgorot: 1_000, accountId: 'a' }),
        tx({ kind: 'expense', amountAgorot: 9_999, accountId: 'a', categoryId: food.id, context: 'business' }),
      ],
      { includeRecurring: false },
    );
    const f = b.lines.find((l) => l.categoryId === food.id)!;
    expect(f).toMatchObject({ spent: 85_000, remaining: 15_000, overBudget: 0, usedBp: 8_500, state: 'near' });
    const r = b.lines.find((l) => l.categoryId === rest.id)!;
    expect(r).toMatchObject({ spent: 60_000, overBudget: 10_000, state: 'over' });
    expect(r.children[0]).toMatchObject({ categoryId: lunch.id, spent: 60_000, budget: null });
    expect(b.uncategorizedSpent).toBe(1_000);
    expect(b.totalBudget).toBe(150_000);
    expect(b.totalSpent).toBe(146_000);
  });

  it('recurring items excluded by default, included with the switch (15.5); overrides per month', () => {
    const t = tx({ kind: 'expense', amountAgorot: 20_000, accountId: 'a', categoryId: food.id, links: { recurringId: 'r1' } });
    expect(computeBudget('2026-09', cats, [], [t], { includeRecurring: false }).lines).toHaveLength(2);
    const on = computeBudget('2026-09', cats, [{ categoryId: food.id, month: '2026-09', amountAgorot: 30_000 }], [t], { includeRecurring: true });
    expect(on.lines.find((l) => l.categoryId === food.id)).toMatchObject({ budget: 30_000, spent: 20_000 });
  });
});

describe('forecast (10.9)', () => {
  const card: Card = { id: 'card', createdAt: ts, updatedAt: ts, name: 'ויזה', issuerId: 'i', last4: '1234', kind: 'credit', billingAccountId: 'bank', chargeDay: 10, cycleCutoffDay: null, context: 'personal', status: 'active' };

  it('combines pending, recurring (bank and card), and card statements; alerts below overdraft', () => {
    const purchase = tx({ kind: 'expense', amountAgorot: 300_000, cardId: 'card', date: '2026-09-20' });
    const statements = computeStatements(card, [purchase], []).map((s) => ({ ...s, cardName: card.name }));
    const f = computeForecast({
      accountId: 'bank',
      today: '2026-09-30',
      days: 60,
      balanceToday: 200_000,
      overdraftLimit: 50_000,
      pending: [tx({ kind: 'income', amountAgorot: 50_000, accountId: 'bank', status: 'pending', date: '2026-10-05' })],
      recurring: [
        rec({ name: 'rent', amountAgorot: 400_000, nextDueDate: '2026-10-01' }),
        rec({ name: 'netflix', kind: 'subscription', amountAgorot: 5_000, nextDueDate: '2026-10-15', cardId: 'card', accountId: undefined }),
        rec({ name: 'savings', kind: 'transfer', amountAgorot: 10_000, nextDueDate: '2026-10-02', toAccountId: 'savings' }),
      ],
      cards: [card],
      statements,
    });
    expect(f.events.map((e) => [e.date, e.amountAgorot, e.kind])).toEqual([
      ['2026-10-01', -400_000, 'recurring'],
      ['2026-10-02', -10_000, 'recurring'],
      ['2026-10-05', 50_000, 'pending'],
      ['2026-10-10', -300_000, 'card'],
      ['2026-11-01', -400_000, 'recurring'],
      ['2026-11-02', -10_000, 'recurring'],
      ['2026-11-10', -5_000, 'recurring'], // netflix of 15/10 is charged with the card on 10/11
    ]);
    expect(f.minBalance).toBe(200_000 - 400_000 - 10_000 + 50_000 - 300_000 - 400_000 - 10_000 - 5_000);
    expect(f.belowZero).toBe(true);
    expect(f.belowOverdraft).toBe(true);
  });

  it('no overdraft limit: only the below-zero alert', () => {
    const f = computeForecast({ accountId: 'bank', today: '2026-09-30', days: 30, balanceToday: 100, pending: [], recurring: [rec({ amountAgorot: 500, nextDueDate: '2026-10-01' })], cards: [], statements: [] });
    expect(f.belowZero).toBe(true);
    expect(f.belowOverdraft).toBe(false);
  });
});
