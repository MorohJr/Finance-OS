import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives (SPEC 4)
// ---------------------------------------------------------------------------

export const Id = z.uuid();

/** Money in agorot. Integer only (CLAUDE.md iron rule 1). */
export const Agorot = z.int();
export const PositiveAgorot = z.int().positive();
export const NonNegativeAgorot = z.int().nonnegative();

/** Percent in basis points: 18% = 1800. */
export const Bp = z.int().min(0).max(100_000);

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** Local calendar date, stored as YYYY-MM-DD (no time). */
export const IsoDate = z.string().regex(ISO_DATE).refine((s) => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}, 'תאריך לא קיים');

/** Month, stored as YYYY-MM. */
export const IsoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** Decimal stored as a string to avoid float drift (quantities, FX rates). */
export const DecimalString = z.string().regex(/^-?\d+(\.\d+)?$/);

export const Timestamp = z.iso.datetime();

export const Context = z.enum(['personal', 'business']);
export const CategoryContext = z.enum(['personal', 'business', 'both']);

/** System fields shared by every entity (SPEC 4). */
const base = {
  id: Id,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletedAt: Timestamp.optional(),
};

const optionalId = Id.optional();

// ---------------------------------------------------------------------------
// 6.1 Account
// ---------------------------------------------------------------------------

export const AccountKind = z.enum(['bank', 'cash', 'savings', 'deposit', 'brokerage', 'prepaid', 'platform']);
export const ActiveStatus = z.enum(['active', 'closed']);

export const Account = z.object({
  ...base,
  name: z.string().min(1),
  kind: AccountKind,
  institutionId: optionalId,
  context: Context,
  overdraftLimit: NonNegativeAgorot.optional(),
  overdraftRatePct: Bp.optional(),
  isVisibleOnDashboard: z.boolean().default(true),
  status: ActiveStatus,
  color: z.string().optional(),
  icon: z.string().optional(),
  /** User's own image for this account; overrides the institution logo (owner request 01/10/2026). */
  logoAttachmentId: optionalId,
  sortOrder: z.number().optional(),
});

// ---------------------------------------------------------------------------
// 6.2 Card
// ---------------------------------------------------------------------------

export const DayOfMonth = z.int().min(1).max(28);

export const Card = z
  .object({
    ...base,
    name: z.string().min(1),
    issuerId: Id,
    // Iron rule 9: last 4 digits only, never a full card number.
    last4: z.string().regex(/^\d{4}$/),
    kind: z.enum(['credit', 'debit']),
    billingAccountId: Id,
    chargeDay: DayOfMonth,
    cycleCutoffDay: DayOfMonth.nullable(),
    creditLimit: NonNegativeAgorot.optional(),
    context: Context,
    status: ActiveStatus,
    /** User's own image for this card; overrides the issuer logo. */
    logoAttachmentId: optionalId,
  })
  .refine((c) => c.kind === 'credit' || c.creditLimit === undefined, {
    message: 'מסגרת אשראי רק לכרטיס credit',
    path: ['creditLimit'],
  });

// ---------------------------------------------------------------------------
// 6.3 Transaction
// ---------------------------------------------------------------------------

export const TransactionKind = z.enum([
  'income',
  'expense',
  'refund',
  'transfer',
  'card_payment',
  'opening_balance',
  'adjustment',
  'loan_disbursement',
  'loan_payment',
  'lending_out',
  'lending_repayment',
  'investment_trade',
]);

export const PaymentMethod = z.enum(['card', 'bank', 'cash', 'bit', 'paybox', 'pepper', 'check', 'standing_order', 'other']);

export const Direction = z.enum(['in', 'out']);

export const TransactionLinks = z.object({
  recurringId: optionalId,
  loanId: optionalId,
  lendingId: optionalId,
  wishItemId: optionalId,
  checkId: optionalId,
  installmentPlanId: optionalId,
  statementId: optionalId,
  payslipId: optionalId,
  tradeId: optionalId,
  // SPEC 6.15: a self-deposit to a pension fund is a transfer linked to the fund.
  pensionFundId: optionalId,
  // DECISION (9.1 step 5): the import batch that created it, so a whole import can be undone.
  importBatchId: optionalId,
  // Owner request 01/10/2026: payment toward a non-loan debt.
  debtId: optionalId,
});

export const BusinessExpenseDetails = z.object({
  vatAgorot: NonNegativeAgorot,
  expenseClassId: Id,
  supplierInvoiceNumber: z.string().optional(),
});

export const BusinessIncomeDetails = z.object({
  netAgorot: NonNegativeAgorot,
  vatAgorot: NonNegativeAgorot,
  incomeTaxReserveAgorot: NonNegativeAgorot,
  niReserveAgorot: NonNegativeAgorot,
  // Snapshot of the rates that applied, so later rate changes don't rewrite history (SPEC 11.2).
  vatRateBp: Bp.optional(),
  incomeTaxRateBp: Bp.optional(),
  nationalInsuranceRateBp: Bp.optional(),
});

/** Kinds whose sign is not implied by the kind itself (SPEC 6.3, decision 30/09/2026). */
export const SIGNED_KINDS = ['opening_balance', 'adjustment', 'investment_trade'] as const;

export const Transaction = z
  .object({
    ...base,
    date: IsoDate,
    kind: TransactionKind,
    amountAgorot: PositiveAgorot,
    direction: Direction.optional(),
    accountId: optionalId,
    cardId: optionalId,
    toAccountId: optionalId,
    categoryId: optionalId,
    payeeId: optionalId,
    description: z.string().optional(),
    note: z.string().optional(),
    tags: z.array(z.string()).default([]),
    context: Context,
    attachmentIds: z.array(Id).default([]),
    paymentMethod: PaymentMethod.optional(),
    links: TransactionLinks.optional(),
    business: z.union([BusinessIncomeDetails, BusinessExpenseDetails]).optional(),
    source: z.enum(['manual', 'import', 'system']),
    importHash: z.string().optional(),
    status: z.enum(['cleared', 'pending']),
  })
  .superRefine((t, ctx) => {
    if (!t.accountId && !t.cardId) {
      ctx.addIssue({ code: 'custom', message: 'חובה חשבון או כרטיס', path: ['accountId'] });
    }
    if (t.kind === 'transfer') {
      // SPEC 6.15: a self-deposit to a pension fund is a transfer out of the bank, linked to the fund.
      if (!t.toAccountId && !t.links?.pensionFundId) ctx.addIssue({ code: 'custom', message: 'העברה דורשת חשבון יעד', path: ['toAccountId'] });
      if (t.toAccountId && t.toAccountId === t.accountId) {
        ctx.addIssue({ code: 'custom', message: 'חשבון מקור ויעד זהים', path: ['toAccountId'] });
      }
    } else if (t.toAccountId) {
      ctx.addIssue({ code: 'custom', message: 'חשבון יעד רק להעברה', path: ['toAccountId'] });
    }
    const signed = (SIGNED_KINDS as readonly string[]).includes(t.kind);
    if (signed && !t.direction) ctx.addIssue({ code: 'custom', message: 'חובה לבחור כיוון', path: ['direction'] });
    if (!signed && t.direction) ctx.addIssue({ code: 'custom', message: 'כיוון רק לסוגים עם ±', path: ['direction'] });
    if (t.kind === 'adjustment' && !t.note?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'תיקון דורש הערה', path: ['note'] });
    }
    if (t.business && t.context !== 'business') {
      ctx.addIssue({ code: 'custom', message: 'פרטי עסק רק ב-context עסקי', path: ['business'] });
    }
  });

// ---------------------------------------------------------------------------
// 6.4 CardStatement, 6.5 InstallmentPlan
// ---------------------------------------------------------------------------

export const CardStatement = z.object({
  ...base,
  cardId: Id,
  chargeDate: IsoDate,
  periodStart: IsoDate,
  periodEnd: IsoDate,
  status: z.enum(['open', 'closed', 'paid']),
  paymentTransactionId: optionalId,
  importedTotal: Agorot.optional(),
});

export const BudgetRecognition = z.enum(['upfront', 'spread']);

export const InstallmentPlan = z.object({
  ...base,
  transactionId: Id,
  cardId: Id,
  totalAgorot: PositiveAgorot,
  count: z.int().min(2),
  kind: z.enum(['installments', 'credit']),
  interestTotalAgorot: NonNegativeAgorot.optional(),
  firstChargeDate: IsoDate,
  budgetRecognition: BudgetRecognition,
});

// ---------------------------------------------------------------------------
// 6.6 Category, 6.7 Payee + CategoryRule
// ---------------------------------------------------------------------------

export const Category = z.object({
  ...base,
  name: z.string().min(1),
  type: z.enum(['income', 'expense']),
  parentId: optionalId,
  monthlyBudget: NonNegativeAgorot.optional(),
  includeInBudget: z.boolean(),
  context: CategoryContext,
  icon: z.string().optional(),
  color: z.string().optional(),
});

export const Payee = z.object({
  ...base,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  defaultCategoryId: optionalId,
  vatId: z.string().optional(),
});

export const CategoryRule = z.object({
  ...base,
  match: z.enum(['contains', 'equals', 'regex']),
  pattern: z.string().min(1),
  categoryId: Id,
  payeeId: optionalId,
  context: Context.optional(),
  priority: z.int(),
});

// ---------------------------------------------------------------------------
// 6.8 Recurring
// ---------------------------------------------------------------------------

export const Frequency = z.enum(['usage_based', 'daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly']);

export const Recurring = z
  .object({
    ...base,
    name: z.string().min(1),
    kind: z.enum(['bill', 'subscription', 'income', 'transfer']),
    amountAgorot: PositiveAgorot.optional(),
    frequency: Frequency,
    nextDueDate: IsoDate,
    // DECISION (10.4): the original day of month, to return to after a short month (31 → 28/02 → 31/03).
    anchorDay: z.int().min(1).max(31).optional(),
    accountId: optionalId,
    cardId: optionalId,
    // DECISION: destination account for kind=transfer (standing order to savings).
    toAccountId: optionalId,
    categoryId: optionalId,
    paymentMethod: PaymentMethod.optional(),
    status: z.enum(['active', 'inactive', 'grace_period', 'trial']),
    trialEndDate: IsoDate.optional(),
    commitmentEndDate: IsoDate.optional(),
    renewalDate: IsoDate.optional(),
    autoCreate: z.boolean(),
    reminderDaysBefore: z.int().nonnegative().optional(),
    linkedToCPI: z.boolean().optional(),
    provider: z.string().optional(),
    logoAttachmentId: optionalId,
    note: z.string().optional(),
  })
  .superRefine((r, ctx) => {
    if (r.status === 'grace_period' && r.kind !== 'bill') {
      ctx.addIssue({ code: 'custom', message: 'grace_period רק לחשבון קבוע', path: ['status'] });
    }
    if (r.status === 'trial' && r.kind !== 'subscription') {
      ctx.addIssue({ code: 'custom', message: 'trial רק למנוי', path: ['status'] });
    }
    if (r.frequency !== 'usage_based' && r.amountAgorot === undefined) {
      ctx.addIssue({ code: 'custom', message: 'חובה סכום', path: ['amountAgorot'] });
    }
    if (!r.accountId && !r.cardId) {
      ctx.addIssue({ code: 'custom', message: 'חובה חשבון או כרטיס', path: ['accountId'] });
    }
    if (r.kind === 'transfer' && (!r.toAccountId || r.toAccountId === r.accountId)) {
      ctx.addIssue({ code: 'custom', message: 'הוראת קבע דורשת חשבון יעד אחר', path: ['toAccountId'] });
    }
  });

// ---------------------------------------------------------------------------
// 6.9 WishItem
// ---------------------------------------------------------------------------

/** The 16 Wish List categories from the template (appendix B). Labels live in strings.he.ts. */
export const WishCategory = z.enum([
  'electronics',
  'clothing',
  'home_garden',
  'books_media',
  'sports_outdoors',
  'toys_games',
  'health_beauty',
  'automotive',
  'appliances',
  'food_drink',
  'arts_crafts',
  'furniture_decor',
  'musical_instruments',
  'office_supplies',
  'digital_product',
  'jewelry_watches',
]);

export const WishItem = z.object({
  ...base,
  name: z.string().min(1),
  priceAgorot: PositiveAgorot,
  category: WishCategory.optional(),
  priority: z.enum(['must', 'high', 'medium', 'low']),
  status: z.enum(['active', 'inactive', 'paused', 'done']),
  fundingMethod: z.enum(['saving', 'installments']),
  startMonth: IsoMonth.optional(),
  goalMonth: IsoMonth.optional(),
  savingsAccountId: optionalId,
  store: z.string().optional(),
  link: z.string().optional(),
  imageAttachmentId: optionalId,
});

// ---------------------------------------------------------------------------
// 6.10 Loan, 6.11 Lending, 6.12 Check
// ---------------------------------------------------------------------------

export const Loan = z.object({
  ...base,
  name: z.string().min(1),
  lenderType: z.enum(['bank', 'card_company', 'check_discounting', 'pension_fund', 'private', 'other']),
  principalAgorot: PositiveAgorot,
  // DECISION 15.1: default annual rate + spitzer; `total` + flat kept for template compatibility.
  rateType: z.enum(['annual', 'total']).default('annual'),
  ratePct: Bp,
  termMonths: z.int().positive(),
  amortization: z.enum(['spitzer', 'equal_principal', 'flat', 'bullet']).default('spitzer'),
  startDate: IsoDate,
  firstPaymentDate: IsoDate,
  feesAgorot: NonNegativeAgorot.optional(),
  accountId: Id,
  receivedToAccountId: optionalId,
  imageAttachmentId: optionalId,
});

export const Lending = z.object({
  ...base,
  borrowerName: z.string().min(1),
  principalAgorot: PositiveAgorot,
  ratePct: Bp.optional(),
  date: IsoDate,
  fromAccountId: Id,
  expectedEndDate: IsoDate.optional(),
  note: z.string().optional(),
});

/**
 * Debt (owner request 01/10/2026): money owed that isn't a loan — an unpaid electricity bill,
 * a fine, a tax authority debt, a case in collection, a settlement with a fixed monthly payment.
 * The balance is derived: original amount + added charges − linked payments (never edited directly).
 */
export const DebtCharge = z.object({
  id: Id,
  date: IsoDate,
  kind: z.enum(['fine', 'interest', 'fee', 'legal', 'other']),
  amountAgorot: PositiveAgorot,
  note: z.string().optional(),
});

export const Debt = z.object({
  ...base,
  creditor: z.string().min(1),
  kind: z.enum(['utility', 'fine', 'tax_authority', 'collection', 'legal_settlement', 'personal', 'other']),
  originalAmountAgorot: PositiveAgorot,
  date: IsoDate,
  status: z.enum(['open', 'arrangement', 'legal', 'settled']),
  charges: z.array(DebtCharge).default([]),
  /** Fixed monthly payment of an arrangement (הסדר). */
  monthlyPaymentAgorot: PositiveAgorot.optional(),
  paymentDay: z.int().min(1).max(31).optional(),
  planStartDate: IsoDate.optional(),
  accountId: optionalId,
  categoryId: optionalId,
  caseNumber: z.string().optional(),
  context: Context,
  note: z.string().optional(),
});

export const Check = z.object({
  ...base,
  direction: z.enum(['issued', 'received']),
  number: z.string().min(1),
  bankName: z.string().optional(),
  branch: z.string().optional(),
  amountAgorot: PositiveAgorot,
  issueDate: IsoDate,
  dueDate: IsoDate,
  counterparty: z.string().min(1),
  accountId: Id,
  status: z.enum(['pending', 'deposited', 'cleared', 'bounced', 'cancelled', 'discounted']),
  context: Context,
  categoryId: optionalId,
  note: z.string().optional(),
  imageAttachmentId: optionalId,
  discountLoanId: optionalId,
});

// ---------------------------------------------------------------------------
// 6.13 NetWorthSnapshot
// ---------------------------------------------------------------------------

export const NetWorthSnapshot = z.object({
  ...base,
  month: IsoMonth,
  assets: Agorot,
  liabilities: Agorot,
  netWorth: Agorot,
  liquidAssets: Agorot,
  breakdown: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------------------------------------
// 6.14 Investments
// ---------------------------------------------------------------------------

export const Sector = z.object({
  ...base,
  name: z.string().min(1),
  sortOrder: z.number().optional(),
});

export const Security = z.object({
  ...base,
  symbol: z.string().min(1),
  name: z.string().min(1),
  exchange: z.enum(['TASE', 'NASDAQ', 'NYSE', 'OTHER']),
  type: z.enum(['stock', 'etf', 'mutual_fund', 'bond']),
  sectorId: optionalId,
  priceUnit: z.enum(['ILS', 'ILA', 'USD']),
});

export const InvestmentTrade = z.object({
  ...base,
  brokerageAccountId: Id,
  securityId: Id,
  type: z.enum(['buy', 'sell', 'dividend', 'fee', 'split', 'tax']),
  date: IsoDate,
  quantity: DecimalString.optional(),
  priceAgorotPerUnit: Agorot.optional(),
  grossAgorot: Agorot,
  feeAgorot: NonNegativeAgorot.optional(),
  taxWithheldAgorot: NonNegativeAgorot.optional(),
  fxRate: DecimalString.optional(),
});

export const PricePoint = z.object({
  ...base,
  securityId: Id,
  date: IsoDate,
  priceAgorot: NonNegativeAgorot,
  source: z.enum(['manual', 'import']),
});

export const FxRate = z.object({
  ...base,
  date: IsoDate,
  usdIls: DecimalString,
});

// ---------------------------------------------------------------------------
// 6.15 Pension
// ---------------------------------------------------------------------------

export const PensionFund = z.object({
  ...base,
  name: z.string().min(1),
  productType: z.enum(['pension_fund', 'managers_insurance', 'provident_fund', 'investment_provident', 'child_savings']),
  provider: z.string().min(1),
  track: z.string().optional(),
  policyLast4: z.string().regex(/^\d{4}$/).optional(),
  feeFromDepositPct: Bp.optional(),
  feeFromBalancePct: Bp.optional(),
  source: z.enum(['employer', 'self_employed', 'private']),
  isLiquid: z.boolean(),
});

export const PensionSnapshot = z.object({
  ...base,
  fundId: Id,
  date: IsoDate,
  balanceAgorot: Agorot,
  depositsEmployeeAgorot: NonNegativeAgorot.optional(),
  depositsEmployerAgorot: NonNegativeAgorot.optional(),
  depositsSeveranceAgorot: NonNegativeAgorot.optional(),
  depositsSelfAgorot: NonNegativeAgorot.optional(),
  returnPct: z.int().optional(),
  // DECISION (6.16): set when the snapshot was created from a payslip, so editing the payslip updates it.
  payslipId: optionalId,
});

// ---------------------------------------------------------------------------
// 6.16 Employer, Payslip
// ---------------------------------------------------------------------------

export const Employer = z.object({
  ...base,
  name: z.string().min(1),
  employerVatId: z.string().optional(),
  startDate: IsoDate.optional(),
  endDate: IsoDate.optional(),
  payDay: z.int().min(1).max(31).default(9),
  depositAccountId: optionalId,
  // DECISION (6.16): the fund that receives the payslip's pension deposits.
  pensionFundId: optionalId,
});

export const PayslipComponent = z.object({
  kind: z.enum(['thirteenth_salary', 'recreation', 'bonus', 'overtime', 'other']),
  label: z.string().optional(),
  amountAgorot: Agorot,
});

export const Payslip = z.object({
  ...base,
  employerId: Id,
  month: IsoMonth,
  grossAgorot: NonNegativeAgorot,
  taxableAgorot: NonNegativeAgorot.optional(),
  incomeTaxAgorot: NonNegativeAgorot,
  nationalInsuranceAgorot: NonNegativeAgorot,
  healthTaxAgorot: NonNegativeAgorot,
  pensionEmployeeAgorot: NonNegativeAgorot.optional(),
  pensionEmployerAgorot: NonNegativeAgorot.optional(),
  severanceAgorot: NonNegativeAgorot.optional(),
  otherDeductionsAgorot: NonNegativeAgorot.optional(),
  netAgorot: NonNegativeAgorot,
  components: z.array(PayslipComponent).optional(),
  attachmentId: optionalId,
});

// ---------------------------------------------------------------------------
// 6.17 Business, ExpenseClass
// ---------------------------------------------------------------------------

export const Business = z.object({
  ...base,
  name: z.string().min(1),
  vatStatus: z.enum(['exempt', 'licensed']),
  openDate: IsoDate.optional(),
  vatReportingPeriod: z.enum(['monthly', 'bimonthly']).optional(),
  isMicroBusiness: z.boolean().optional(),
  businessAccountId: optionalId,
  taxReserveAccountId: optionalId,
});

export const ExpenseClass = z.object({
  ...base,
  name: z.string().min(1),
  incomeTaxRecognizedPct: Bp,
  vatRecognizedPct: Bp,
  note: z.string().optional(),
});

// ---------------------------------------------------------------------------
// 6.18 TaxSettings
// ---------------------------------------------------------------------------

export const TaxSettings = z.object({
  ...base,
  year: z.int().min(2000).max(2100),
  effectiveFrom: IsoDate,
  vatRateBp: Bp,
  // User-entered. null until the user fills them in (iron rule 4: no tax numbers in code).
  incomeTaxRateBp: Bp.nullable(),
  nationalInsuranceRateBp: Bp.nullable(),
  // Owner request 01/10/2026: NI for the self-employed is often a fixed monthly advance, not a
  // percentage. Absent = 'percent' (rows saved before this change).
  nationalInsuranceMode: z.enum(['percent', 'fixed_monthly']).optional(),
  nationalInsuranceMonthlyAgorot: NonNegativeAgorot.optional(),
  reserveBasis: z.enum(['net_income', 'profit_ratio']),
  capitalGainsRateBp: Bp,
  paturCeilingAgorot: NonNegativeAgorot,
  pensionAvgWageAgorot: NonNegativeAgorot,
  pensionLowRateBp: Bp,
  pensionHighRateBp: Bp,
  vatDueDay: z.int().min(1).max(28),
});

// ---------------------------------------------------------------------------
// 6.19 Budget, Import, Attachment, Institution, Settings
// ---------------------------------------------------------------------------

export const BudgetOverride = z.object({
  ...base,
  categoryId: Id,
  month: IsoMonth,
  amountAgorot: NonNegativeAgorot,
});

export const ImportBatch = z.object({
  ...base,
  source: z.string(),
  fileName: z.string(),
  importedAt: Timestamp,
  rowCount: z.int().nonnegative(),
  createdCount: z.int().nonnegative(),
  skippedDuplicates: z.int().nonnegative(),
  mappingPresetId: optionalId,
});

export const ImportTargetField = z.enum([
  'transactionDate',
  'chargeDate',
  'description',
  'chargeAmount',
  'originalAmount',
  'debit',
  'credit',
  'signedAmount',
  'installmentNumber',
  'installmentCount',
  'note',
  'cardLast4',
]);

export const ImportPreset = z.object({
  ...base,
  name: z.string().min(1),
  institutionId: optionalId,
  headerSignature: z.array(z.string()),
  mapping: z.partialRecord(ImportTargetField, z.string()),
  dateFormat: z.enum(['DD/MM/YYYY', 'DD/MM/YY']).optional(),
});

/** In the DB an attachment holds a Blob; in a backup file it is base64 (see services/backup). */
export const Attachment = z.object({
  id: Id,
  blob: z.instanceof(Blob),
  mime: z.string(),
  size: z.int().nonnegative(),
  createdAt: Timestamp,
  updatedAt: Timestamp.optional(),
  deletedAt: Timestamp.optional(),
});

export const Institution = z.object({
  ...base,
  name: z.string().min(1),
  kind: z.enum(['bank', 'card_issuer', 'pension_provider', 'broker', 'other']),
  code: z.string().optional(),
  color: z.string(),
  logoAttachmentId: optionalId,
});

export const Theme = z.enum(['system', 'light', 'dark']);

/** Singleton row, key SETTINGS_ID. */
export const Settings = z.object({
  id: z.literal('app'),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  theme: Theme,
  hideAgorot: z.boolean(),
  // DECISION 15.3: installments are recognized in the budget by charge month.
  defaultBudgetRecognition: BudgetRecognition,
  lastBackupAt: Timestamp.optional(),
  pinHash: z.string().optional(),
  pinSalt: z.string().optional(),
  // DECISION 15.5: recurring bills and subscriptions are not in the budget by default.
  includeRecurringInBudget: z.boolean(),
  // DECISION 15.4: moving weighted average, FIFO optional.
  costBasisMethod: z.enum(['moving_average', 'fifo']),
  forecastDays: z.int().min(7).max(365),
  lastNetWorthSnapshotMonth: IsoMonth.optional(),
});

export const SETTINGS_ID = 'app' as const;

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Account = z.infer<typeof Account>;
export type Card = z.infer<typeof Card>;
export type Transaction = z.infer<typeof Transaction>;
export type TransactionKind = z.infer<typeof TransactionKind>;
export type CardStatement = z.infer<typeof CardStatement>;
export type InstallmentPlan = z.infer<typeof InstallmentPlan>;
export type Category = z.infer<typeof Category>;
export type Payee = z.infer<typeof Payee>;
export type CategoryRule = z.infer<typeof CategoryRule>;
export type Recurring = z.infer<typeof Recurring>;
export type WishItem = z.infer<typeof WishItem>;
export type Loan = z.infer<typeof Loan>;
export type Lending = z.infer<typeof Lending>;
export type Debt = z.infer<typeof Debt>;
export type DebtCharge = z.infer<typeof DebtCharge>;
export type Check = z.infer<typeof Check>;
export type NetWorthSnapshot = z.infer<typeof NetWorthSnapshot>;
export type Sector = z.infer<typeof Sector>;
export type Security = z.infer<typeof Security>;
export type InvestmentTrade = z.infer<typeof InvestmentTrade>;
export type PricePoint = z.infer<typeof PricePoint>;
export type FxRate = z.infer<typeof FxRate>;
export type PensionFund = z.infer<typeof PensionFund>;
export type PensionSnapshot = z.infer<typeof PensionSnapshot>;
export type Employer = z.infer<typeof Employer>;
export type Payslip = z.infer<typeof Payslip>;
export type Business = z.infer<typeof Business>;
export type ExpenseClass = z.infer<typeof ExpenseClass>;
export type TaxSettings = z.infer<typeof TaxSettings>;
export type BudgetOverride = z.infer<typeof BudgetOverride>;
export type ImportBatch = z.infer<typeof ImportBatch>;
export type ImportPreset = z.infer<typeof ImportPreset>;
export type Attachment = z.infer<typeof Attachment>;
export type Institution = z.infer<typeof Institution>;
export type Settings = z.infer<typeof Settings>;
export type Theme = z.infer<typeof Theme>;
