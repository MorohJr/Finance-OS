import { describe, expect, it } from 'vitest';
import { Card, IsoDate, Transaction } from '../../domain/schemas';

const ts = '2026-09-30T09:00:00.000Z';
const id = () => crypto.randomUUID();
const baseTx = () => ({ id: id(), createdAt: ts, updatedAt: ts, date: '2026-09-30', context: 'personal', source: 'manual', status: 'cleared' });

describe('Transaction schema', () => {
  it('accepts a plain expense', () => {
    expect(Transaction.safeParse({ ...baseTx(), kind: 'expense', amountAgorot: 1000, accountId: id() }).success).toBe(true);
  });
  it('amount must be a positive integer (iron rule 1)', () => {
    expect(Transaction.safeParse({ ...baseTx(), kind: 'expense', amountAgorot: 10.5, accountId: id() }).success).toBe(false);
    expect(Transaction.safeParse({ ...baseTx(), kind: 'expense', amountAgorot: -100, accountId: id() }).success).toBe(false);
  });
  it('needs an account or a card', () => {
    expect(Transaction.safeParse({ ...baseTx(), kind: 'expense', amountAgorot: 1000 }).success).toBe(false);
  });
  it('transfer needs a different target account', () => {
    const a = id();
    expect(Transaction.safeParse({ ...baseTx(), kind: 'transfer', amountAgorot: 1000, accountId: a }).success).toBe(false);
    expect(Transaction.safeParse({ ...baseTx(), kind: 'transfer', amountAgorot: 1000, accountId: a, toAccountId: a }).success).toBe(false);
    expect(Transaction.safeParse({ ...baseTx(), kind: 'transfer', amountAgorot: 1000, accountId: a, toAccountId: id() }).success).toBe(true);
  });
  it('opening_balance and adjustment need a direction; others must not have one', () => {
    expect(Transaction.safeParse({ ...baseTx(), kind: 'opening_balance', amountAgorot: 1000, accountId: id() }).success).toBe(false);
    expect(Transaction.safeParse({ ...baseTx(), kind: 'opening_balance', direction: 'out', amountAgorot: 1000, accountId: id() }).success).toBe(true);
    expect(Transaction.safeParse({ ...baseTx(), kind: 'expense', direction: 'out', amountAgorot: 1000, accountId: id() }).success).toBe(false);
  });
  it('adjustment needs a note', () => {
    expect(Transaction.safeParse({ ...baseTx(), kind: 'adjustment', direction: 'in', amountAgorot: 1000, accountId: id() }).success).toBe(false);
    expect(Transaction.safeParse({ ...baseTx(), kind: 'adjustment', direction: 'in', amountAgorot: 1000, accountId: id(), note: 'תיקון' }).success).toBe(true);
  });
});

describe('Card schema', () => {
  const card = { id: id(), createdAt: ts, updatedAt: ts, name: 'כאל', issuerId: id(), kind: 'credit', billingAccountId: id(), chargeDay: 10, cycleCutoffDay: null, context: 'personal', status: 'active' };
  it('stores only the last 4 digits (iron rule 9)', () => {
    expect(Card.safeParse({ ...card, last4: '4821' }).success).toBe(true);
    expect(Card.safeParse({ ...card, last4: '4580123412344821' }).success).toBe(false);
  });
  it('chargeDay is 1..28', () => {
    expect(Card.safeParse({ ...card, last4: '4821', chargeDay: 31 }).success).toBe(false);
  });
});

describe('IsoDate', () => {
  it('rejects impossible dates', () => {
    expect(IsoDate.safeParse('2026-02-30').success).toBe(false);
    expect(IsoDate.safeParse('2026-02-28').success).toBe(true);
  });
});
