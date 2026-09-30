import { describe, expect, it } from 'vitest';
import { amortizationSchedule, lendingStatus, loanStatus, monthlyDebt, spitzerPayment, yearlyDebt } from '../../calc/loans';
import { tx } from './fixtures';

const base = { principalAgorot: 5_000_000, ratePct: 600, termMonths: 36, firstPaymentDate: '2026-11-10' } as const;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('golden example 14.3: ₪50,000, 6% annual, 36 months', () => {
  it('Spitzer: ₪1,521.10 a month, ₪54,759.49 in total', () => {
    expect(spitzerPayment(5_000_000, 600, 36)).toBe(152_110);
    const s = amortizationSchedule({ ...base, rateType: 'annual', amortization: 'spitzer' });
    expect(s[0]?.payment).toBe(152_110);
    expect(sum(s.map((r) => r.payment))).toBe(5_475_949);
    expect(sum(s.map((r) => r.principal))).toBe(5_000_000);
    expect(s.at(-1)?.balanceAfter).toBe(0);
  });

  it('equal principal: first ₪1,638.89, last ₪1,395.79', () => {
    const s = amortizationSchedule({ ...base, rateType: 'annual', amortization: 'equal_principal' });
    expect(s[0]?.payment).toBe(163_889);
    expect(s.at(-1)?.payment).toBe(139_579);
    expect(s.at(-1)?.principal).toBe(138_885);
    expect(sum(s.map((r) => r.principal))).toBe(5_000_000);
  });

  it('flat with total interest 6%: ₪1,472.22 a month', () => {
    const s = amortizationSchedule({ ...base, rateType: 'total', amortization: 'flat' });
    expect(s[0]?.payment).toBe(147_222);
    expect(sum(s.map((r) => r.payment))).toBe(5_300_000);
    // rateType=total forces flat even if spitzer was chosen (10.6).
    expect(amortizationSchedule({ ...base, rateType: 'total', amortization: 'spitzer' })[0]?.payment).toBe(147_222);
  });
});

describe('other schedules', () => {
  it('bullet (check discounting): one payment at maturity', () => {
    const s = amortizationSchedule({ principalAgorot: 1_000_000, ratePct: 200, termMonths: 3, firstPaymentDate: '2026-12-31', rateType: 'total', amortization: 'bullet' });
    expect(s).toEqual([{ n: 1, date: '2026-12-31', payment: 1_020_000, interest: 20_000, principal: 1_000_000, balanceAfter: 0 }]);
  });
  it('zero interest', () => {
    const s = amortizationSchedule({ principalAgorot: 100_000, ratePct: 0, termMonths: 3, firstPaymentDate: '2026-01-31', rateType: 'annual', amortization: 'spitzer' });
    expect(s.map((r) => [r.date, r.payment])).toEqual([
      ['2026-01-31', 33_333],
      ['2026-02-28', 33_333],
      ['2026-03-31', 33_334],
    ]);
  });
});

describe('actual payments (10.6)', () => {
  const loan = { id: 'L', ...base, rateType: 'annual' as const, amortization: 'spitzer' as const };
  it('splits by schedule; a larger payment goes to principal', () => {
    const p1 = tx({ kind: 'loan_payment', amountAgorot: 152_110, accountId: 'a', date: '2026-11-10', links: { loanId: 'L' } });
    const p2 = tx({ kind: 'loan_payment', amountAgorot: 200_000, accountId: 'a', date: '2026-12-10', links: { loanId: 'L' } });
    const st = loanStatus(loan, [p1, p2], '2026-12-15');
    expect(st.splits[0]).toMatchObject({ interest: 25_000, principal: 127_110 });
    const interest2 = st.schedule[1]!.interest;
    expect(st.splits[1]).toMatchObject({ interest: interest2, principal: 200_000 - interest2 });
    expect(st.remainingPrincipal).toBe(5_000_000 - 127_110 - (200_000 - interest2));
    expect(st.status).toBe('active');
  });
  it('overdue after the grace period with a missing payment', () => {
    expect(loanStatus(loan, [], '2026-11-14').status).toBe('active');
    expect(loanStatus(loan, [], '2026-11-16').status).toBe('overdue');
  });
  it('debt metrics: monthly and next 12 months', () => {
    const st = loanStatus(loan, [], '2026-10-01');
    const charges = [{ chargeDate: '2026-11-10', amountAgorot: 40_000 }];
    expect(monthlyDebt([st], charges, '2026-11')).toBe(152_110 + 40_000);
    // Before the first payment's month the loan still counts with its PMT.
    expect(monthlyDebt([st], charges, '2026-10')).toBe(152_110);
    expect(yearlyDebt([st], charges, '2026-10-01')).toBe(11 * 152_110 + 40_000); // Nov..Sep = 11 payments
  });
});

describe('loans I gave (10.7)', () => {
  it('total due with interest; principal first, then interest is income', () => {
    const l = { id: 'X', principalAgorot: 1_000_000, ratePct: 500 };
    const r1 = tx({ kind: 'lending_repayment', amountAgorot: 600_000, accountId: 'a', date: '2026-10-01', links: { lendingId: 'X' } });
    const r2 = tx({ kind: 'lending_repayment', amountAgorot: 450_000, accountId: 'a', date: '2026-11-01', links: { lendingId: 'X' } });
    const st = lendingStatus(l, [r1, r2]);
    expect(st.totalDue).toBe(1_050_000);
    expect(st.interestByTx.get(r1.id)).toBe(0);
    expect(st.interestByTx.get(r2.id)).toBe(50_000);
    expect(st.remaining).toBe(0);
    expect(st.isPaidOff).toBe(true);
  });
});

describe('wish list (10.8)', async () => {
  const { wishStatus } = await import('../../calc/wish');
  const item = { id: 'W', priceAgorot: 600_000, fundingMethod: 'saving' as const, startMonth: '2026-06', goalMonth: '2026-12', status: 'active' as const };
  it('saving by transfers: progress, months left, monthly needed, behind schedule', () => {
    const t1 = tx({ kind: 'transfer', amountAgorot: 150_000, accountId: 'a', toAccountId: 's', links: { wishItemId: 'W' } });
    const s = wishStatus(item, [t1], [], new Map(), '2026-09-30');
    expect(s.savedOrPaid).toBe(150_000);
    expect(s.progressBp).toBe(2_500);
    expect(s.monthsLeft).toBe(3);
    expect(s.monthlyNeeded).toBe(150_000);
    expect(s.label).toBe('behind'); // 3 of 6 months passed, only 25% saved
  });
  it('done at 100%, months left at least 1', () => {
    const t1 = tx({ kind: 'transfer', amountAgorot: 700_000, accountId: 'a', toAccountId: 's', links: { wishItemId: 'W' } });
    const s = wishStatus({ ...item, goalMonth: '2026-01' }, [t1], [], new Map(), '2026-09-30');
    expect(s).toMatchObject({ progressBp: 10_000, monthsLeft: 1, monthlyNeeded: 0, label: 'done' });
  });
  it('installments through a card plan count only charges already paid', () => {
    const buy = tx({ kind: 'expense', amountAgorot: 600_000, cardId: 'c', links: { wishItemId: 'W' } });
    const charges = [1, 2, 3].map((n) => ({ planId: 'p', transactionId: buy.id, cardId: 'c', number: n, count: 3, amountAgorot: 200_000, chargeDate: `2026-${String(8 + n).padStart(2, '0')}-10` }));
    const s = wishStatus({ ...item, fundingMethod: 'installments' }, [buy], [{ transactionId: buy.id }], new Map([[buy.id, charges]]), '2026-10-15');
    expect(s.savedOrPaid).toBe(400_000);
  });
});
