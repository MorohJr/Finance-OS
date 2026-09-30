import type { Employer, Payslip } from '../domain/schemas';
import { addMonths, withDay } from './dates';
import { BP_SCALE, divRoundHalfUp, sumAgorot } from './money';
import type { ForecastEvent } from './forecast';

/** Salary (SPEC 6.16): payslip values are entered by hand. Nothing here computes tax. */

export function payslipDeductions(p: Pick<Payslip, 'incomeTaxAgorot' | 'nationalInsuranceAgorot' | 'healthTaxAgorot' | 'pensionEmployeeAgorot' | 'otherDeductionsAgorot'>): number {
  return sumAgorot([p.incomeTaxAgorot, p.nationalInsuranceAgorot, p.healthTaxAgorot, p.pensionEmployeeAgorot ?? 0, p.otherDeductionsAgorot ?? 0]);
}

/** gross − deductions − net. Non-zero is a warning, not a block (6.16). */
export function netMismatch(p: Parameters<typeof payslipDeductions>[0] & Pick<Payslip, 'grossAgorot' | 'netAgorot'>): number {
  return p.grossAgorot - payslipDeductions(p) - p.netAgorot;
}

/** DECISION (6.16): a payslip for month M is paid on payDay of month M+1. */
export function payDate(month: string, payDay: number): string {
  return withDay(addMonths(`${month}-01`, 1), payDay);
}

export interface SalaryAverages {
  count: number;
  gross: number;
  net: number;
  /** Effective income-tax rate on taxable income, bp. */
  incomeTaxBp: number | null;
  /** All deductions ÷ gross, bp. */
  deductionsBp: number | null;
}

export function averages(payslips: readonly Payslip[], lastN: number): SalaryAverages {
  const recent = payslips.filter((p) => !p.deletedAt).sort((a, b) => b.month.localeCompare(a.month)).slice(0, lastN);
  if (!recent.length) return { count: 0, gross: 0, net: 0, incomeTaxBp: null, deductionsBp: null };
  const gross = sumAgorot(recent.map((p) => p.grossAgorot));
  const taxable = sumAgorot(recent.map((p) => p.taxableAgorot ?? p.grossAgorot));
  const net = sumAgorot(recent.map((p) => p.netAgorot));
  return {
    count: recent.length,
    gross: divRoundHalfUp(gross, recent.length),
    net: divRoundHalfUp(net, recent.length),
    incomeTaxBp: taxable > 0 ? divRoundHalfUp(sumAgorot(recent.map((p) => p.incomeTaxAgorot)) * BP_SCALE, taxable) : null,
    deductionsBp: gross > 0 ? divRoundHalfUp(sumAgorot(recent.map(payslipDeductions)) * BP_SCALE, gross) : null,
  };
}

/**
 * Expected salary for the forecast (10.9): on each payDay in the horizon, the average net of the
 * last 3 payslips, unless that month's payslip already exists (its transaction is in the data).
 */
export function expectedSalaryEvents(employers: readonly Employer[], payslips: readonly Payslip[], accountId: string, today: string, horizon: string): ForecastEvent[] {
  const events: ForecastEvent[] = [];
  for (const e of employers) {
    if (e.deletedAt || e.depositAccountId !== accountId) continue;
    const mine = payslips.filter((p) => p.employerId === e.id && !p.deletedAt);
    const avg = averages(mine, 3);
    if (!avg.count) continue;
    const have = new Set(mine.map((p) => p.month));
    for (let i = 0; i < 24; i++) {
      const month = addMonths(`${today.slice(0, 7)}-01`, i - 1).slice(0, 7);
      const date = payDate(month, e.payDay);
      if (date > horizon) break;
      if (date < today || have.has(month) || (e.endDate && month > e.endDate.slice(0, 7))) continue;
      events.push({ date, amountAgorot: avg.net, kind: 'salary', label: e.name, refId: e.id });
    }
  }
  return events;
}
