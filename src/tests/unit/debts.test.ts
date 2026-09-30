import { describe, expect, it } from 'vitest';
import { debtSchedule, debtStatus, planDueDates } from '../../calc/debts';
import { computeNetWorth } from '../../calc/netWorth';
import type { Debt } from '../../domain/schemas';
import { tx } from './fixtures';

const ts = '2026-01-01T00:00:00.000Z';
const debt = (p: Partial<Debt>): Debt => ({ id: 'D', createdAt: ts, updatedAt: ts, creditor: 'חברת החשמל', kind: 'utility', originalAmountAgorot: 240_000, date: '2026-06-01', status: 'open', charges: [], context: 'personal', ...p });
const pay = (amount: number, date = '2026-07-10') => tx({ kind: 'expense', amountAgorot: amount, accountId: 'a', date, links: { debtId: 'D' } });

describe('non-loan debts', () => {
  it('balance = original + charges − payments; settled at 0', () => {
    const d = debt({ charges: [{ id: crypto.randomUUID(), date: '2026-07-01', kind: 'fine', amountAgorot: 25_000 }] });
    const s = debtStatus(d, [pay(100_000), pay(1, '2026-07-11'), tx({ kind: 'expense', amountAgorot: 999, accountId: 'a' })], '2026-08-01');
    expect(s).toMatchObject({ total: 265_000, chargesTotal: 25_000, paid: 100_001, remaining: 164_999, isSettled: false });
    expect(debtStatus(d, [pay(265_000)], '2026-08-01')).toMatchObject({ remaining: 0, isSettled: true, progressBp: 10_000 });
  });

  it('arrangement: due dates, next payment, payments left, payoff date', () => {
    const d = debt({ kind: 'legal_settlement', status: 'arrangement', originalAmountAgorot: 1_000_000, monthlyPaymentAgorot: 150_000, paymentDay: 15, planStartDate: '2026-07-01' });
    expect(planDueDates(d, '2026-09-30')).toEqual(['2026-07-15', '2026-08-15', '2026-09-15']);
    const s = debtStatus(d, [pay(150_000, '2026-07-15'), pay(150_000, '2026-08-15'), pay(150_000, '2026-09-15')], '2026-09-30');
    expect(s).toMatchObject({ remaining: 550_000, behind: 0, overdue: false, nextPayment: { date: '2026-10-15', amount: 150_000 }, paymentsLeft: 4, payoffDate: '2027-01-15' });
    // Last payment is only what's left.
    expect(debtSchedule(d, s, '2027-06-30').map((x) => x.amount)).toEqual([150_000, 150_000, 150_000, 100_000]);
  });

  it('a missed arrangement payment is overdue after the grace days', () => {
    const d = debt({ status: 'arrangement', originalAmountAgorot: 1_000_000, monthlyPaymentAgorot: 150_000, paymentDay: 15, planStartDate: '2026-07-01' });
    const paidTwo = [pay(150_000, '2026-07-15'), pay(150_000, '2026-08-15')];
    expect(debtStatus(d, paidTwo, '2026-09-18').overdue).toBe(false);
    expect(debtStatus(d, paidTwo, '2026-09-21')).toMatchObject({ overdue: true, behind: 150_000 });
  });

  it('debts are liabilities in net worth', () => {
    expect(computeNetWorth({ accountBalances: [500_000], debtsRemaining: 200_000 })).toMatchObject({ liabilities: 200_000, netWorth: 300_000 });
  });
});
