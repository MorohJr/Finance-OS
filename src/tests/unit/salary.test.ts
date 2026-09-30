import { describe, expect, it } from 'vitest';
import { averages, expectedSalaryEvents, netMismatch, payDate } from '../../calc/salary';
import type { Employer, Payslip } from '../../domain/schemas';

const ts = '2026-01-01T00:00:00.000Z';
const slip = (month: string, gross: number, net: number, tax = 150_000): Payslip => ({
  id: crypto.randomUUID(), createdAt: ts, updatedAt: ts, employerId: 'E', month,
  grossAgorot: gross, incomeTaxAgorot: tax, nationalInsuranceAgorot: 60_000, healthTaxAgorot: 40_000, pensionEmployeeAgorot: 90_000, netAgorot: net,
});
const employer: Employer = { id: 'E', createdAt: ts, updatedAt: ts, name: 'חברת הייטק', payDay: 9, depositAccountId: 'bank' };

describe('salary (6.16)', () => {
  it('net check: gross − deductions = net (warning only)', () => {
    expect(netMismatch(slip('2026-08', 1_500_000, 1_160_000))).toBe(0);
    expect(netMismatch(slip('2026-08', 1_500_000, 1_150_000))).toBe(10_000);
  });
  it('pay date: payDay of the following month, clamped', () => {
    expect(payDate('2026-09', 9)).toBe('2026-10-09');
    expect(payDate('2026-01', 31)).toBe('2026-02-28');
    expect(payDate('2026-12', 1)).toBe('2027-01-01');
  });
  it('averages and effective rates', () => {
    const a = averages([slip('2026-07', 1_500_000, 1_160_000), slip('2026-08', 1_500_000, 1_160_000), slip('2026-09', 1_800_000, 1_400_000, 210_000), slip('2026-01', 1, 1)], 3);
    expect(a.count).toBe(3);
    expect(a.gross).toBe(1_600_000);
    expect(a.net).toBe(1_240_000);
    expect(a.incomeTaxBp).toBe(1_063); // 510,000 / 4,800,000
  });
  it('expected salary in the forecast: average net, skipping months that have a payslip', () => {
    const slips = [slip('2026-07', 1_500_000, 1_200_000), slip('2026-08', 1_500_000, 1_200_000)];
    // today 30/09: the August payslip was paid 09/09; next: Sept (09/10), Oct (09/11)
    const ev = expectedSalaryEvents([employer], slips, 'bank', '2026-09-30', '2026-11-30');
    expect(ev.map((e) => [e.date, e.amountAgorot])).toEqual([
      ['2026-10-09', 1_200_000],
      ['2026-11-09', 1_200_000],
    ]);
    expect(expectedSalaryEvents([employer], [...slips, slip('2026-09', 1, 1)], 'bank', '2026-09-30', '2026-10-31')).toEqual([]);
    expect(expectedSalaryEvents([{ ...employer, endDate: '2026-09-30' }], slips, 'bank', '2026-09-30', '2026-11-30')).toHaveLength(1);
  });
});
