import type { ExpenseClass } from '../../domain/schemas';
import { BP_SCALE, divRoundHalfUp, mulBp, sumAgorot } from '../money';
import type { VatStatus } from './vat';

/**
 * Business expenses (SPEC 11.3):
 *   licensed: vatDeductible = vat × vatRecognizedPct; recognized = (amount − vatDeductible) × incomeTaxRecognizedPct
 *   exempt:   vatDeductible = 0;                      recognized = amount × incomeTaxRecognizedPct
 *   micro business: recognized expenses for the year = 30% × revenue, instead of actual expenses.
 */

export interface ExpenseBreakdown {
  amount: number;
  vat: number;
  vatDeductible: number;
  recognizedExpense: number;
}

export function businessExpense(amountInclVat: number, vat: number, cls: Pick<ExpenseClass, 'incomeTaxRecognizedPct' | 'vatRecognizedPct'>, status: VatStatus): ExpenseBreakdown {
  const vatDeductible = status === 'licensed' ? mulBp(vat, cls.vatRecognizedPct) : 0;
  const recognizedExpense = mulBp(amountInclVat - vatDeductible, cls.incomeTaxRecognizedPct);
  return { amount: amountInclVat, vat, vatDeductible, recognizedExpense };
}

/** SPEC 11.3: micro business ("עסק זעיר") recognizes a fixed 30% of revenue. */
export const MICRO_BUSINESS_EXPENSE_BP = 3000;

export function recognizedExpensesYtd(expenses: readonly ExpenseBreakdown[], revenueYtd: number, isMicro: boolean): number {
  return isMicro ? divRoundHalfUp(revenueYtd * MICRO_BUSINESS_EXPENSE_BP, BP_SCALE) : sumAgorot(expenses.map((e) => e.recognizedExpense));
}
