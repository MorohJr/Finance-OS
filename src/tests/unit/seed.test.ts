import { describe, expect, it } from 'vitest';
import * as S from '../../domain/schemas';
import { buildSeedRows } from '../../db/seed';
import { FinanceDB } from '../../db/db';
import { SYSTEM_CATEGORY_IDS } from '../../db/seed.data';

describe('seed (appendices A–C)', () => {
  const rows = buildSeedRows('2026-09-30T09:00:00.000Z');

  it('institutions: 11 banks, 5 card issuers, 10 pension providers, 4 platforms', () => {
    const count = (k: string) => rows.institutions.filter((i) => i.kind === k).length;
    expect(count('bank')).toBe(11);
    expect(count('card_issuer')).toBe(5);
    expect(count('pension_provider')).toBe(10);
    expect(count('other')).toBe(4);
  });

  it('categories match appendix B', () => {
    const personalExpense = rows.categories.filter((c) => c.context === 'personal' && c.type === 'expense');
    const personalIncome = rows.categories.filter((c) => c.context === 'personal' && c.type === 'income');
    expect(personalExpense).toHaveLength(33);
    expect(personalIncome).toHaveLength(12);
    const business = rows.categories.filter((c) => c.context === 'business');
    expect(business).toHaveLength(4 + 14);
    for (const sysId of Object.values(SYSTEM_CATEGORY_IDS)) {
      expect(rows.categories.some((c) => c.id === sysId)).toBe(true);
    }
  });

  it('15 sectors and 14 expense classes', () => {
    expect(rows.sectors).toHaveLength(15);
    expect(rows.expenseClasses).toHaveLength(14);
  });

  it('tax settings: VAT 18%, income tax and NI empty (iron rule 4)', () => {
    const [tax] = rows.taxSettings;
    expect(tax?.vatRateBp).toBe(1800);
    expect(tax?.incomeTaxRateBp).toBeNull();
    expect(tax?.nationalInsuranceRateBp).toBeNull();
    expect(tax?.paturCeilingAgorot).toBe(12_283_300);
  });

  it('settings default to the open-decision defaults (15.3–15.5)', () => {
    const [s] = rows.settings;
    expect(s?.defaultBudgetRecognition).toBe('spread');
    expect(s?.includeRecurringInBudget).toBe(false);
    expect(s?.costBasisMethod).toBe('moving_average');
  });

  it('every seeded row passes its Zod schema', () => {
    const schemas = {
      institutions: S.Institution,
      categories: S.Category,
      sectors: S.Sector,
      expenseClasses: S.ExpenseClass,
      taxSettings: S.TaxSettings,
      settings: S.Settings,
    } as const;
    for (const [table, schema] of Object.entries(schemas)) {
      for (const row of rows[table as keyof typeof rows]) {
        const r = schema.safeParse(row);
        expect(r.success, `${table}: ${JSON.stringify(r.error?.issues)}`).toBe(true);
      }
    }
  });

  it('a fresh database is seeded exactly once', async () => {
    const name = `seed-${crypto.randomUUID()}`;
    const db = new FinanceDB(name);
    await db.open();
    expect(await db.institutions.count()).toBe(30);
    db.close();
    const again = new FinanceDB(name);
    await again.open();
    expect(await again.institutions.count()).toBe(30);
    await again.delete();
  });
});
