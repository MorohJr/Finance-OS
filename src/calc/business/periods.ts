import { addMonths, withDay } from '../dates';
import { monthRange } from '../cashflow';
import { sumAgorot } from '../money';

/** VAT reporting periods (SPEC 11.5): monthly, or bimonthly Jan–Feb, Mar–Apr, … */

export interface VatPeriod {
  key: string; // first month, YYYY-MM
  from: string;
  to: string;
  dueDate: string;
}

export function vatPeriodOf(date: string, period: 'monthly' | 'bimonthly', dueDay: number): VatPeriod {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  const first = period === 'monthly' ? m : m % 2 === 0 ? m - 1 : m;
  const last = period === 'monthly' ? first : first + 1;
  const key = `${y}-${String(first).padStart(2, '0')}`;
  const lastMonth = `${y}-${String(last).padStart(2, '0')}`;
  const to = monthRange(lastMonth).to;
  return { key, from: `${key}-01`, to, dueDate: withDay(addMonths(`${lastMonth}-01`, 1), dueDay) };
}

export interface VatReport extends VatPeriod {
  outputVat: number;
  inputVat: number;
  /** Negative = refund. */
  vatDue: number;
  incomeCount: number;
  expenseCount: number;
}

/**
 * outputVat = Σ VAT of business incomes in the period (by transaction date);
 * inputVat = Σ deductible VAT of business expenses in the period; vatDue = output − input.
 */
export function vatReport(
  period: VatPeriod,
  incomes: readonly { date: string; vat: number }[],
  expenses: readonly { date: string; vatDeductible: number }[],
): VatReport {
  const inRange = (d: string) => d >= period.from && d <= period.to;
  const inc = incomes.filter((i) => inRange(i.date));
  const exp = expenses.filter((e) => inRange(e.date));
  const outputVat = sumAgorot(inc.map((i) => i.vat));
  const inputVat = sumAgorot(exp.map((e) => e.vatDeductible));
  return { ...period, outputVat, inputVat, vatDue: outputVat - inputVat, incomeCount: inc.length, expenseCount: exp.length };
}
