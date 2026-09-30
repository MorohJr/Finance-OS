import Dexie, { type EntityTable } from 'dexie';
import type * as D from '../domain/schemas';
import { seedDatabase } from './seed';

export const DB_NAME = 'finance-os';

/**
 * Table name → Dexie index spec.
 * First key is the primary key. Every schema change MUST add a new `db.version(n)` with an
 * upgrade function below; never edit a published version (CLAUDE.md iron rule 8).
 */
export const SCHEMA_V1 = {
  accounts: 'id, kind, status, context, sortOrder',
  cards: 'id, billingAccountId, issuerId, status',
  transactions:
    'id, date, kind, accountId, cardId, toAccountId, categoryId, payeeId, context, status, source, importHash, ' +
    '[accountId+date], [cardId+date], links.statementId, links.installmentPlanId, links.recurringId, links.loanId, ' +
    'links.lendingId, links.wishItemId, links.checkId, links.payslipId, links.tradeId, links.pensionFundId',
  cardStatements: 'id, cardId, chargeDate, status, [cardId+chargeDate]',
  installmentPlans: 'id, cardId, transactionId',
  categories: 'id, type, parentId, context',
  payees: 'id, name, *aliases',
  categoryRules: 'id, priority, categoryId',
  recurring: 'id, kind, nextDueDate, status',
  wishItems: 'id, status, fundingMethod',
  loans: 'id, accountId',
  lendings: 'id, fromAccountId',
  checks: 'id, direction, dueDate, status, accountId',
  netWorthSnapshots: 'id, &month',
  sectors: 'id, sortOrder',
  securities: 'id, symbol, sectorId',
  investmentTrades: 'id, securityId, brokerageAccountId, date',
  pricePoints: 'id, securityId, [securityId+date]',
  fxRates: 'id, &date',
  pensionFunds: 'id, source',
  pensionSnapshots: 'id, fundId, date, [fundId+date]',
  employers: 'id',
  payslips: 'id, employerId, month, [employerId+month]',
  businesses: 'id',
  expenseClasses: 'id',
  taxSettings: 'id, year, effectiveFrom',
  budgetOverrides: 'id, [categoryId+month], month',
  importBatches: 'id, importedAt',
  importPresets: 'id, institutionId',
  attachments: 'id',
  institutions: 'id, kind',
  settings: 'id',
} as const;

/** v2 (01/10/2026): non-loan debts. Adds a table only; existing data is untouched. */
export const SCHEMA_V2 = { ...SCHEMA_V1, debts: 'id, status, kind' } as const;

export type TableName = keyof typeof SCHEMA_V2;

export const CURRENT_SCHEMA_VERSION = 2;

export class FinanceDB extends Dexie {
  accounts!: EntityTable<D.Account, 'id'>;
  cards!: EntityTable<D.Card, 'id'>;
  transactions!: EntityTable<D.Transaction, 'id'>;
  cardStatements!: EntityTable<D.CardStatement, 'id'>;
  installmentPlans!: EntityTable<D.InstallmentPlan, 'id'>;
  categories!: EntityTable<D.Category, 'id'>;
  payees!: EntityTable<D.Payee, 'id'>;
  categoryRules!: EntityTable<D.CategoryRule, 'id'>;
  recurring!: EntityTable<D.Recurring, 'id'>;
  wishItems!: EntityTable<D.WishItem, 'id'>;
  loans!: EntityTable<D.Loan, 'id'>;
  lendings!: EntityTable<D.Lending, 'id'>;
  checks!: EntityTable<D.Check, 'id'>;
  debts!: EntityTable<D.Debt, 'id'>;
  netWorthSnapshots!: EntityTable<D.NetWorthSnapshot, 'id'>;
  sectors!: EntityTable<D.Sector, 'id'>;
  securities!: EntityTable<D.Security, 'id'>;
  investmentTrades!: EntityTable<D.InvestmentTrade, 'id'>;
  pricePoints!: EntityTable<D.PricePoint, 'id'>;
  fxRates!: EntityTable<D.FxRate, 'id'>;
  pensionFunds!: EntityTable<D.PensionFund, 'id'>;
  pensionSnapshots!: EntityTable<D.PensionSnapshot, 'id'>;
  employers!: EntityTable<D.Employer, 'id'>;
  payslips!: EntityTable<D.Payslip, 'id'>;
  businesses!: EntityTable<D.Business, 'id'>;
  expenseClasses!: EntityTable<D.ExpenseClass, 'id'>;
  taxSettings!: EntityTable<D.TaxSettings, 'id'>;
  budgetOverrides!: EntityTable<D.BudgetOverride, 'id'>;
  importBatches!: EntityTable<D.ImportBatch, 'id'>;
  importPresets!: EntityTable<D.ImportPreset, 'id'>;
  attachments!: EntityTable<D.Attachment, 'id'>;
  institutions!: EntityTable<D.Institution, 'id'>;
  settings!: EntityTable<D.Settings, 'id'>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    // New table; no data to transform, so no upgrade function is needed.
    this.version(2).stores(SCHEMA_V2);
    // Runs once, when the database is first created.
    this.on('populate', (tx) => seedDatabase(tx));
  }
}

export const TABLE_NAMES = Object.keys(SCHEMA_V2) as TableName[];

/** Tables whose rows are the user's own data (used to decide if a backup reminder is relevant). */
export const USER_DATA_TABLES: readonly TableName[] = [
  'accounts',
  'cards',
  'transactions',
  'recurring',
  'wishItems',
  'loans',
  'lendings',
  'checks',
  'debts',
  'securities',
  'pensionFunds',
  'employers',
  'businesses',
];

export const db = new FinanceDB();
