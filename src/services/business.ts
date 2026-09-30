import type { FinanceDB } from '../db/db';
import { Business, TaxSettings, type Business as BusinessT, type TaxSettings as TaxT, type Transaction as Tx } from '../domain/schemas';
import { SYSTEM_CATEGORY_IDS } from '../db/seed.data';
import { incomeVat, splitInclusive, type AmountMode } from '../calc/business/vat';
import { setAside, type ReserveBreakdown } from '../calc/business/reserve';
import { businessOverview, VAT_TAG_PREFIX, type BusinessOverview } from '../calc/business/overview';
import { nowIso, todayIL } from '../calc/dates';
import { sumAgorot } from '../calc/money';
import { compact, newSystemFields, validate } from './entity';
import { createTransaction, updateTransaction } from './transactions';
import { findOrCreatePayee } from './payees';
import { saveTransactionWithInstallments } from './cards';

// ---------------------------------------------------------------------------
// Tax settings (6.18): versions by effectiveFrom, so a change never rewrites saved calculations.
// ---------------------------------------------------------------------------

export async function taxSettingsAt(db: FinanceDB, date: string = todayIL()): Promise<TaxT | undefined> {
  const all = (await db.taxSettings.filter((t) => !t.deletedAt && t.effectiveFrom <= date).toArray()).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt));
  return all.at(-1) ?? (await db.taxSettings.orderBy('effectiveFrom').first());
}

export type TaxInput = Omit<TaxT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'year' | 'effectiveFrom'>;

/** Saves new rates effective today: today's version is updated, otherwise a new version is added. */
export async function saveTaxSettings(db: FinanceDB, input: TaxInput, today: string = todayIL()): Promise<TaxT> {
  const current = await taxSettingsAt(db, today);
  const ts = nowIso();
  // Rates entered for the first time (the version in effect never had them): nothing was ever
  // calculated with it, so update it in place. Otherwise back-dated incomes from before today
  // would find a version without rates.
  const neverSet = current && current.incomeTaxRateBp === null && current.nationalInsuranceRateBp === null && current.nationalInsuranceMonthlyAgorot === undefined;
  if (current && (current.effectiveFrom === today || neverSet)) {
    const row = validate(TaxSettings, { ...current, ...input, updatedAt: ts });
    await db.taxSettings.put(row);
    return row;
  }
  const row = validate(TaxSettings, { ...newSystemFields(), year: Number(today.slice(0, 4)), effectiveFrom: today, ...input });
  await db.taxSettings.add(row);
  return row;
}

export function ratesReady(t: Pick<TaxT, 'incomeTaxRateBp' | 'nationalInsuranceRateBp' | 'nationalInsuranceMode' | 'nationalInsuranceMonthlyAgorot'> | undefined): boolean {
  if (!t || t.incomeTaxRateBp === null) return false;
  return t.nationalInsuranceMode === 'fixed_monthly' ? t.nationalInsuranceMonthlyAgorot !== undefined : t.nationalInsuranceRateBp !== null;
}

// ---------------------------------------------------------------------------
// Business (6.17)
// ---------------------------------------------------------------------------

export async function getBusiness(db: FinanceDB): Promise<BusinessT | undefined> {
  return db.businesses.filter((b) => !b.deletedAt).first();
}

export type BusinessInput = Omit<BusinessT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function saveBusiness(db: FinanceDB, input: BusinessInput): Promise<BusinessT> {
  const current = await getBusiness(db);
  const row = validate(Business, { ...(current ? { id: current.id, createdAt: current.createdAt, updatedAt: nowIso() } : newSystemFields()), ...compact(input) });
  await db.businesses.put(row);
  return row;
}

// ---------------------------------------------------------------------------
// Income calculator (11.2)
// ---------------------------------------------------------------------------

export interface IncomeInput {
  amountAgorot: number;
  mode: AmountMode;
  date: string;
  accountId: string;
  payeeName?: string;
  received: boolean;
  note?: string;
}

export interface IncomePreview extends ReserveBreakdown {
  net: number;
  vat: number;
  total: number;
}

/** Profit and revenue so far this year, for reserveBasis = profit_ratio. */
async function ytdProfit(db: FinanceDB, date: string): Promise<{ profit: number; revenue: number }> {
  const o = await loadBusinessOverview(db, date);
  return o ? { profit: o.profitYtd, revenue: o.revenueYtd } : { profit: 0, revenue: 0 };
}

export async function previewIncome(db: FinanceDB, amountAgorot: number, mode: AmountMode, date: string): Promise<IncomePreview | undefined> {
  const [business, tax] = [await getBusiness(db), await taxSettingsAt(db, date)];
  if (!business || !tax || !ratesReady(tax)) return undefined;
  const v = incomeVat(amountAgorot, mode, business.vatStatus, tax.vatRateBp);
  const r = setAside(v, { incomeTaxRateBp: tax.incomeTaxRateBp!, nationalInsuranceRateBp: tax.nationalInsuranceRateBp ?? 0, nationalInsuranceMode: tax.nationalInsuranceMode, reserveBasis: tax.reserveBasis }, await ytdProfit(db, date));
  return { ...r, ...v };
}

/** Saves the income as a transaction of `total`, with the breakdown and the rates that applied (snapshot). */
export async function saveBusinessIncome(db: FinanceDB, input: IncomeInput, id?: string): Promise<{ tx: Tx; preview: IncomePreview }> {
  const business = await getBusiness(db);
  const tax = await taxSettingsAt(db, input.date);
  if (!business || !tax || !ratesReady(tax)) throw new Error('rates_missing');
  const preview = (await previewIncome(db, input.amountAgorot, input.mode, input.date))!;
  const payee = input.payeeName?.trim() ? await findOrCreatePayee(db, input.payeeName, SYSTEM_CATEGORY_IDS.businessIncome) : undefined;
  const txInput = {
    kind: 'income' as const,
    amountAgorot: preview.total,
    date: input.date,
    accountId: input.accountId,
    categoryId: SYSTEM_CATEGORY_IDS.businessIncome,
    payeeId: payee?.id,
    note: input.note,
    context: 'business' as const,
    status: input.received ? ('cleared' as const) : ('pending' as const),
    business: {
      netAgorot: preview.net,
      vatAgorot: preview.vat,
      incomeTaxReserveAgorot: preview.incomeTaxReserve,
      niReserveAgorot: preview.niReserve,
      vatRateBp: business.vatStatus === 'licensed' ? tax.vatRateBp : 0,
      incomeTaxRateBp: tax.incomeTaxRateBp!,
      nationalInsuranceRateBp: tax.nationalInsuranceMode === 'fixed_monthly' ? undefined : (tax.nationalInsuranceRateBp ?? undefined),
    },
  };
  const tx = id ? await updateTransaction(db, id, txInput) : await createTransaction(db, txInput);
  return { tx, preview };
}

/** "העבר לקופת מיסים": moves the set-aside amount to the tax reserve account (11.2). */
export async function moveToTaxReserve(db: FinanceDB, fromAccountId: string, amountAgorot: number, date: string = todayIL()): Promise<Tx> {
  const business = await getBusiness(db);
  if (!business?.taxReserveAccountId) throw new Error('no_reserve_account');
  return createTransaction(db, { kind: 'transfer', amountAgorot, date, accountId: fromAccountId, toAccountId: business.taxReserveAccountId, context: 'business', status: 'cleared', source: 'manual', description: 'קופת מיסים' });
}

// ---------------------------------------------------------------------------
// Business expenses (11.3)
// ---------------------------------------------------------------------------

export interface ExpenseInput {
  amountAgorot: number; // incl. VAT
  vatAgorot?: number; // default: computed from the VAT rate; 0 for an exempt supplier
  expenseClassId: string;
  supplierInvoiceNumber?: string;
  date: string;
  accountId?: string;
  cardId?: string;
  payeeName?: string;
  note?: string;
}

/** VAT included in an amount, at the rate in effect (editable by the user). */
export async function defaultInputVat(db: FinanceDB, amountAgorot: number, date: string): Promise<number> {
  const tax = await taxSettingsAt(db, date);
  return tax ? splitInclusive(amountAgorot, tax.vatRateBp).vat : 0;
}

export async function saveBusinessExpense(db: FinanceDB, input: ExpenseInput, id?: string): Promise<Tx> {
  const cls = await db.expenseClasses.get(input.expenseClassId);
  if (!cls) throw new Error('class_not_found');
  // The business expense category with the same name as the class (appendix B).
  const category = await db.categories.filter((c) => !c.deletedAt && c.context === 'business' && c.type === 'expense' && c.name === cls.name).first();
  const vat = input.vatAgorot ?? (await defaultInputVat(db, input.amountAgorot, input.date));
  const payee = input.payeeName?.trim() ? await findOrCreatePayee(db, input.payeeName, category?.id) : undefined;
  return saveTransactionWithInstallments(db, id, {
    kind: 'expense',
    amountAgorot: input.amountAgorot,
    date: input.date,
    accountId: input.cardId ? undefined : input.accountId,
    cardId: input.cardId,
    categoryId: category?.id,
    payeeId: payee?.id,
    note: input.note,
    context: 'business',
    status: 'cleared',
    business: { vatAgorot: vat, expenseClassId: cls.id, supplierInvoiceNumber: input.supplierInvoiceNumber?.trim() || undefined },
  });
}

// ---------------------------------------------------------------------------
// VAT payment (11.5) and overview
// ---------------------------------------------------------------------------

/**
 * "שולם": a business expense in the VAT category, tagged with the period, not a recognized expense.
 * A refund period (negative) is recorded as a refund in the same category.
 */
export async function markVatPaid(db: FinanceDB, periodKey: string, vatDue: number, accountId: string, date: string = todayIL()): Promise<Tx> {
  return createTransaction(db, {
    kind: vatDue >= 0 ? 'expense' : 'refund',
    amountAgorot: Math.abs(vatDue),
    date,
    accountId,
    categoryId: SYSTEM_CATEGORY_IDS.vatPayment,
    context: 'business',
    status: 'cleared',
    source: 'manual',
    description: `מע"מ ${periodKey}`,
    tags: [`${VAT_TAG_PREFIX}${periodKey}`],
  });
}

export async function loadBusinessOverview(db: FinanceDB, today: string = todayIL()): Promise<BusinessOverview | undefined> {
  const business = await getBusiness(db);
  const tax = await taxSettingsAt(db, today);
  if (!business || !tax) return undefined;
  const [txs, classes, funds, snaps] = await Promise.all([
    db.transactions.filter((t) => !t.deletedAt && (t.context === 'business' || t.categoryId === SYSTEM_CATEGORY_IDS.incomeTaxAdvances || t.categoryId === SYSTEM_CATEGORY_IDS.nationalInsuranceAdvances)).toArray(),
    db.expenseClasses.toArray(),
    db.pensionFunds.filter((f) => !f.deletedAt && f.source === 'self_employed').toArray(),
    db.pensionSnapshots.filter((s) => !s.deletedAt).toArray(),
  ]);
  const year = today.slice(0, 4);
  const fundIds = new Set(funds.map((f) => f.id));
  const selfDeposits = sumAgorot(snaps.filter((s) => fundIds.has(s.fundId) && s.date.startsWith(year) && s.date <= today).map((s) => s.depositsSelfAgorot ?? 0));
  return businessOverview(business, tax, txs, new Map(classes.map((c) => [c.id, c])), selfDeposits, today);
}
