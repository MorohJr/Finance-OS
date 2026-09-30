import type { Business, ExpenseClass, TaxSettings, Transaction } from '../../domain/schemas';
import { SYSTEM_CATEGORY_IDS } from '../../db/seed.data';
import { monthsBetween } from '../dates';
import { mulBp, sumAgorot } from '../money';
import { businessExpense, recognizedExpensesYtd, type ExpenseBreakdown } from './expenses';
import { paturStatus, pensionObligation, type PaturStatus, type PensionObligation } from './obligations';
import { vatPeriodOf, vatReport, type VatReport } from './periods';

/**
 * Business year-to-date (SPEC 11.4), VAT periods (11.5), mandatory pension (11.6) and the
 * exempt-dealer ceiling (11.7), from the business's transactions and the user's tax settings.
 */

type Tx = Pick<Transaction, 'id' | 'kind' | 'amountAgorot' | 'date' | 'categoryId' | 'context' | 'status' | 'deletedAt' | 'business' | 'tags'>;

export const VAT_TAG_PREFIX = 'vat-';

export interface IncomeLine {
  id: string;
  date: string;
  net: number;
  vat: number;
  total: number;
  reserve: number; // income tax + NI reserved by the calculator
  cleared: boolean;
}

export interface BusinessOverview {
  year: string;
  monthsElapsed: number;
  revenueYtd: number;
  recognizedExpensesYtd: number;
  unclassifiedExpenses: number;
  profitYtd: number;
  estimatedIncomeTax: number | null;
  estimatedNi: number | null;
  reservedYtd: number;
  paidYtd: number;
  gap: number | null;
  setAsideYtd: number; // reserves + VAT of this year's incomes
  incomeThisMonth: number;
  vatReports: (VatReport & { paid: boolean })[];
  currentVat?: VatReport & { paid: boolean };
  patur?: PaturStatus;
  pension: PensionObligation;
  incomes: IncomeLine[];
  expenses: (ExpenseBreakdown & { id: string; date: string })[];
}

function isBusinessIncome(t: Tx): boolean {
  return t.kind === 'income' && t.context === 'business' && !t.deletedAt && t.categoryId !== SYSTEM_CATEGORY_IDS.vatPayment;
}

function incomeLine(t: Tx): IncomeLine {
  const b = t.business && 'netAgorot' in t.business ? t.business : undefined;
  // DECISION: an income entered outside the calculator counts as net, without VAT.
  return {
    id: t.id,
    date: t.date,
    net: b ? b.netAgorot : t.amountAgorot,
    vat: b ? b.vatAgorot : 0,
    total: t.amountAgorot,
    reserve: b ? b.incomeTaxReserveAgorot + b.niReserveAgorot : 0,
    cleared: t.status === 'cleared',
  };
}

export function businessOverview(
  business: Pick<Business, 'vatStatus' | 'vatReportingPeriod' | 'isMicroBusiness' | 'openDate'>,
  tax: Pick<TaxSettings, 'incomeTaxRateBp' | 'nationalInsuranceRateBp' | 'vatDueDay' | 'paturCeilingAgorot' | 'pensionAvgWageAgorot' | 'pensionLowRateBp' | 'pensionHighRateBp'>,
  txs: readonly Tx[],
  classes: ReadonlyMap<string, Pick<ExpenseClass, 'incomeTaxRecognizedPct' | 'vatRecognizedPct'>>,
  selfPensionDepositsYtd: number,
  today: string,
): BusinessOverview {
  const year = today.slice(0, 4);
  const yearStart = `${year}-01-01`;
  const inYear = (d: string) => d >= yearStart && d <= `${year}-12-31`;
  const opened = business.openDate && business.openDate > yearStart ? business.openDate : yearStart;
  const monthsElapsed = Math.max(1, monthsBetween(opened, today) + 1);

  const incomes = txs.filter(isBusinessIncome).map(incomeLine);
  const ytdIncomes = incomes.filter((i) => inYear(i.date) && i.date <= today);
  const revenueYtd = sumAgorot(ytdIncomes.filter((i) => i.cleared).map((i) => i.net));

  const advanceCats = new Set<string>([SYSTEM_CATEGORY_IDS.incomeTaxAdvances, SYSTEM_CATEGORY_IDS.nationalInsuranceAdvances]);
  const excluded = new Set<string>([...advanceCats, SYSTEM_CATEGORY_IDS.vatPayment]);
  const expenseTxs = txs.filter((t) => (t.kind === 'expense' || t.kind === 'refund') && t.context === 'business' && !t.deletedAt && t.status === 'cleared' && !excluded.has(t.categoryId ?? ''));
  const expenses = expenseTxs.flatMap((t) => {
    const b = t.business && 'expenseClassId' in t.business ? t.business : undefined;
    const cls = b ? classes.get(b.expenseClassId) : undefined;
    if (!b || !cls) return [];
    const e = businessExpense(t.amountAgorot, b.vatAgorot, cls, business.vatStatus);
    const sign = t.kind === 'refund' ? -1 : 1;
    return [{ id: t.id, date: t.date, amount: sign * e.amount, vat: sign * e.vat, vatDeductible: sign * e.vatDeductible, recognizedExpense: sign * e.recognizedExpense }];
  });
  // DECISION: a business expense without an expense class isn't recognized until it gets one.
  const unclassifiedExpenses = expenseTxs.filter((t) => !(t.business && 'expenseClassId' in t.business && classes.has(t.business.expenseClassId))).length;
  const ytdExpenses = expenses.filter((e) => inYear(e.date) && e.date <= today);
  const recognized = recognizedExpensesYtd(ytdExpenses, revenueYtd, !!business.isMicroBusiness);
  const profitYtd = revenueYtd - recognized;
  const taxable = Math.max(0, profitYtd);
  const estimatedIncomeTax = tax.incomeTaxRateBp === null ? null : mulBp(taxable, tax.incomeTaxRateBp);
  const estimatedNi = tax.nationalInsuranceRateBp === null ? null : mulBp(taxable, tax.nationalInsuranceRateBp);
  const reservedYtd = sumAgorot(ytdIncomes.filter((i) => i.cleared).map((i) => i.reserve));
  const paidYtd = sumAgorot(txs.filter((t) => !t.deletedAt && t.status === 'cleared' && t.kind === 'expense' && advanceCats.has(t.categoryId ?? '') && inYear(t.date)).map((t) => t.amountAgorot));
  const gap = estimatedIncomeTax === null || estimatedNi === null ? null : estimatedIncomeTax + estimatedNi - paidYtd;

  // VAT periods of the year so far (licensed only).
  const vatReports: BusinessOverview['vatReports'] = [];
  if (business.vatStatus === 'licensed') {
    const period = business.vatReportingPeriod ?? 'bimonthly';
    const paidKeys = new Set(txs.filter((t) => !t.deletedAt && t.categoryId === SYSTEM_CATEGORY_IDS.vatPayment).flatMap((t) => t.tags.filter((x) => x.startsWith(VAT_TAG_PREFIX)).map((x) => x.slice(VAT_TAG_PREFIX.length))));
    for (let m = 1; m <= Number(today.slice(5, 7)); m++) {
      const p = vatPeriodOf(`${year}-${String(m).padStart(2, '0')}-01`, period, tax.vatDueDay);
      if (vatReports.some((r) => r.key === p.key)) continue;
      vatReports.push({ ...vatReport(p, incomes.map((i) => ({ date: i.date, vat: i.vat })), expenses), paid: paidKeys.has(p.key) });
    }
  }

  return {
    year,
    monthsElapsed,
    revenueYtd,
    recognizedExpensesYtd: recognized,
    unclassifiedExpenses,
    profitYtd,
    estimatedIncomeTax,
    estimatedNi,
    reservedYtd,
    paidYtd,
    gap,
    setAsideYtd: sumAgorot(ytdIncomes.map((i) => i.reserve + i.vat)),
    incomeThisMonth: sumAgorot(incomes.filter((i) => i.date.startsWith(today.slice(0, 7))).map((i) => i.net)),
    vatReports,
    currentVat: vatReports.at(-1),
    // SPEC 11.7: turnover = Σ business income totals since 1/1; salary is not counted.
    patur: business.vatStatus === 'exempt' ? paturStatus(ytdIncomes.map((i) => i.total), tax.paturCeilingAgorot, monthsElapsed) : undefined,
    pension: pensionObligation(profitYtd, monthsElapsed, tax.pensionAvgWageAgorot, tax.pensionLowRateBp, tax.pensionHighRateBp, selfPensionDepositsYtd),
    incomes,
    expenses,
  };
}
