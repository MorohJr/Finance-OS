import { describe, expect, it } from 'vitest';
import { accountBalance, balanceSeries, balancesByAccount, overdraftStatus, signedAmountFor } from '../../calc/balance';
import { summarizeFlows } from '../../calc/cashflow';
import { ils, tx } from './fixtures';

const bank = 'bank-1';
const savings = 'savings-1';

describe('golden example 14.1', () => {
  const txs = [
    tx({ kind: 'opening_balance', direction: 'in', amountAgorot: ils(1000), accountId: bank, date: '2026-09-01' }),
    tx({ kind: 'income', amountAgorot: ils(500), accountId: bank, date: '2026-09-05' }),
    tx({ kind: 'expense', amountAgorot: ils(200), accountId: bank, date: '2026-09-10' }),
    tx({ kind: 'transfer', amountAgorot: ils(300), accountId: bank, toAccountId: savings, date: '2026-09-12' }),
  ];

  it('balances: bank ₪1,000, savings ₪300', () => {
    expect(accountBalance(bank, txs)).toBe(ils(1000));
    expect(accountBalance(savings, txs)).toBe(ils(300));
    const all = balancesByAccount([bank, savings], txs);
    expect(all.get(bank)).toBe(ils(1000));
    expect(all.get(savings)).toBe(ils(300));
  });

  it('income ₪500, expenses ₪200 (opening balance and transfer are neither)', () => {
    const s = summarizeFlows(txs, { from: '2026-09-01', to: '2026-09-30' });
    expect(s.income).toBe(ils(500));
    expect(s.expense).toBe(ils(200));
    expect(s.net).toBe(ils(300));
  });
});

describe('balance = sum of transactions in every scenario', () => {
  it('pending and deleted transactions do not count', () => {
    const txs = [
      tx({ kind: 'income', amountAgorot: 1000, accountId: bank }),
      tx({ kind: 'expense', amountAgorot: 400, accountId: bank, status: 'pending' }),
      tx({ kind: 'expense', amountAgorot: 300, accountId: bank, deletedAt: '2026-09-30T10:00:00.000Z' }),
    ];
    expect(accountBalance(bank, txs)).toBe(1000);
  });

  it('negative opening balance and adjustments by direction', () => {
    const txs = [
      tx({ kind: 'opening_balance', direction: 'out', amountAgorot: 50_000, accountId: bank }),
      tx({ kind: 'adjustment', direction: 'in', amountAgorot: 1_000, accountId: bank, note: 'תיקון עמלה' }),
    ];
    expect(accountBalance(bank, txs)).toBe(-49_000);
  });

  it('refund adds to the account, card purchase does not touch the bank', () => {
    const txs = [
      tx({ kind: 'refund', amountAgorot: 500, accountId: bank }),
      tx({ kind: 'expense', amountAgorot: 9_999, cardId: 'card-1' }),
    ];
    expect(accountBalance(bank, txs)).toBe(500);
  });

  it('kinds from later stages have the right sign', () => {
    const cases: [Parameters<typeof tx>[0], number][] = [
      [{ kind: 'card_payment', amountAgorot: 100, accountId: bank }, -100],
      [{ kind: 'loan_disbursement', amountAgorot: 100, accountId: bank }, 100],
      [{ kind: 'loan_payment', amountAgorot: 100, accountId: bank }, -100],
      [{ kind: 'lending_out', amountAgorot: 100, accountId: bank }, -100],
      [{ kind: 'lending_repayment', amountAgorot: 100, accountId: bank }, 100],
      [{ kind: 'investment_trade', direction: 'out', amountAgorot: 100, accountId: bank }, -100],
    ];
    for (const [t, expected] of cases) expect(signedAmountFor(tx(t), bank)).toBe(expected);
  });

  it('balance up to a date', () => {
    const txs = [
      tx({ kind: 'income', amountAgorot: 1000, accountId: bank, date: '2026-09-01' }),
      tx({ kind: 'expense', amountAgorot: 300, accountId: bank, date: '2026-09-20' }),
    ];
    expect(accountBalance(bank, txs, '2026-09-19')).toBe(1000);
  });
});

describe('balanceSeries', () => {
  it('starts from the balance before the range and closes at the end', () => {
    const txs = [
      tx({ kind: 'income', amountAgorot: 1000, accountId: bank, date: '2026-08-01' }),
      tx({ kind: 'expense', amountAgorot: 300, accountId: bank, date: '2026-09-10' }),
      tx({ kind: 'expense', amountAgorot: 200, accountId: bank, date: '2026-09-10' }),
      tx({ kind: 'income', amountAgorot: 50, accountId: bank, date: '2026-09-20' }),
    ];
    expect(balanceSeries(bank, txs, '2026-09-01', '2026-09-30')).toEqual([
      { date: '2026-09-01', balance: 1000 },
      { date: '2026-09-10', balance: 500 },
      { date: '2026-09-20', balance: 550 },
      { date: '2026-09-30', balance: 550 },
    ]);
  });
});

describe('overdraft (10.1)', () => {
  it('available, utilization, 80% alert, monthly interest estimate', () => {
    const s = overdraftStatus(ils(-8000), { overdraftLimit: ils(10000), overdraftRatePct: 1200 });
    expect(s.isOverdrawn).toBe(true);
    expect(s.availableWithOverdraft).toBe(ils(2000));
    expect(s.utilizationBp).toBe(8000);
    expect(s.alert).toBe(true);
    expect(s.estimatedMonthlyInterest).toBe(ils(80)); // 8,000 × 12% ÷ 12
  });
  it('positive balance: no alert', () => {
    const s = overdraftStatus(ils(100), { overdraftLimit: ils(5000) });
    expect(s.isOverdrawn).toBe(false);
    expect(s.alert).toBe(false);
    expect(s.availableWithOverdraft).toBe(ils(5100));
  });
});
