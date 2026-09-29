import type { Transaction as DexieTransaction } from 'dexie';
import type { Category, ExpenseClass, Institution, Sector, Settings, TaxSettings } from '../domain/schemas';
import { SETTINGS_ID } from '../domain/schemas';
import { nowIso } from '../calc/dates';
import {
  BUSINESS_SYSTEM_CATEGORIES,
  EXPENSE_CLASSES,
  INSTITUTIONS,
  PERSONAL_EXPENSE_CATEGORIES,
  PERSONAL_INCOME_CATEGORIES,
  SECTORS,
  TAX_DEFAULTS_2026,
} from './seed.data';

export interface SeedRows {
  institutions: Institution[];
  categories: Category[];
  sectors: Sector[];
  expenseClasses: ExpenseClass[];
  taxSettings: TaxSettings[];
  settings: Settings[];
}

export function defaultSettings(ts: string): Settings {
  return {
    id: SETTINGS_ID,
    createdAt: ts,
    updatedAt: ts,
    theme: 'system',
    hideAgorot: false,
    defaultBudgetRecognition: 'spread', // DECISION 15.3
    includeRecurringInBudget: false, // DECISION 15.5
    costBasisMethod: 'moving_average', // DECISION 15.4
    forecastDays: 60,
  };
}

/** Builds all seed rows (appendices A–C). Pure apart from UUID generation, so it can be tested. */
export function buildSeedRows(ts: string = nowIso(), uuid: () => string = () => crypto.randomUUID()): SeedRows {
  const sys = { createdAt: ts, updatedAt: ts };

  const institutions: Institution[] = INSTITUTIONS.map((i) => ({ id: uuid(), ...sys, ...i }));

  const categories: Category[] = [
    ...PERSONAL_EXPENSE_CATEGORIES.map(
      (name): Category => ({ id: uuid(), ...sys, name, type: 'expense', includeInBudget: true, context: 'personal' }),
    ),
    ...PERSONAL_INCOME_CATEGORIES.map(
      (name): Category => ({ id: uuid(), ...sys, name, type: 'income', includeInBudget: false, context: 'personal' }),
    ),
    ...BUSINESS_SYSTEM_CATEGORIES.map(
      (c): Category => ({ ...sys, ...c, includeInBudget: false, context: 'business' }),
    ),
    // Appendix B: every ExpenseClass is also a business expense category.
    ...EXPENSE_CLASSES.map(
      (e): Category => ({ id: uuid(), ...sys, name: e.name, type: 'expense', includeInBudget: false, context: 'business' }),
    ),
  ];

  const sectors: Sector[] = SECTORS.map((name, i) => ({ id: uuid(), ...sys, name, sortOrder: i }));

  const expenseClasses: ExpenseClass[] = EXPENSE_CLASSES.map((e) => ({ id: uuid(), ...sys, ...e }));

  const taxSettings: TaxSettings[] = [{ id: uuid(), ...sys, ...TAX_DEFAULTS_2026 }];

  return { institutions, categories, sectors, expenseClasses, taxSettings, settings: [defaultSettings(ts)] };
}

/** Called from Dexie's `populate` event, inside the creation transaction. */
export async function seedDatabase(tx: DexieTransaction): Promise<void> {
  const rows = buildSeedRows();
  for (const [table, items] of Object.entries(rows)) {
    await tx.table(table).bulkAdd(items);
  }
}
