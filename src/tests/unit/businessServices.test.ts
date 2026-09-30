import { afterEach, describe, expect, it } from 'vitest';
import { FinanceDB } from '../../db/db';
import { createAccount } from '../../services/accounts';
import { loadBusinessOverview, markVatPaid, moveToTaxReserve, previewIncome, ratesReady, saveBusiness, saveBusinessExpense, saveBusinessIncome, saveTaxSettings, taxSettingsAt } from '../../services/business';
import { createTransaction } from '../../services/transactions';
import { accountBalance } from '../../calc/balance';
import { summarizeFlows } from '../../calc/cashflow';
import { SYSTEM_CATEGORY_IDS } from '../../db/seed.data';

const dbs: FinanceDB[] = [];
afterEach(async () => {
  while (dbs.length) await dbs.pop()!.delete();
});

async function setup(vatStatus: 'licensed' | 'exempt' = 'licensed') {
  const db = new FinanceDB(`b-${crypto.randomUUID()}`);
  dbs.push(db);
  await db.open();
  const bank = await createAccount(db, { name: 'עו"ש עסקי', kind: 'bank', context: 'business', isVisibleOnDashboard: true });
  const reserve = await createAccount(db, { name: 'קופת מיסים', kind: 'savings', context: 'business', isVisibleOnDashboard: true });
  await saveBusiness(db, { name: 'סטודיו', vatStatus, vatReportingPeriod: 'bimonthly', businessAccountId: bank.id, taxReserveAccountId: reserve.id });
  return { db, bank, reserve };
}

const cls = async (db: FinanceDB, name: string) => (await db.expenseClasses.filter((c) => c.name.startsWith(name)).first())!;

describe('business module (stage 8, golden 14.4–14.6 through services)', () => {
  it('rates must be entered first (11.1); saving a change creates a version from today', async () => {
    const { db } = await setup();
    expect(ratesReady(await taxSettingsAt(db, '2026-09-30'))).toBe(false);
    await expect(saveBusinessIncome(db, { amountAgorot: 1, mode: 'excl_vat', date: '2026-09-30', accountId: 'x', received: true })).rejects.toThrow('rates_missing');
    const t = await saveTaxSettings(db, { vatRateBp: 1800, incomeTaxRateBp: 2000, nationalInsuranceRateBp: 1600, reserveBasis: 'net_income', capitalGainsRateBp: 2500, paturCeilingAgorot: 12_283_300, pensionAvgWageAgorot: 1_376_900, pensionLowRateBp: 445, pensionHighRateBp: 1255, vatDueDay: 15 }, '2026-09-30');
    expect(t.effectiveFrom).toBe('2026-09-30');
    expect((await taxSettingsAt(db, '2026-09-01'))?.incomeTaxRateBp).toBeNull(); // earlier dates keep the old version
    expect(ratesReady(await taxSettingsAt(db, '2026-09-30'))).toBe(true);
  });

  it('income: saved as total with the breakdown snapshot; reports count net; VAT period due ₪1,740', async () => {
    const { db, bank, reserve } = await setup();
    await saveTaxSettings(db, { vatRateBp: 1800, incomeTaxRateBp: 2000, nationalInsuranceRateBp: 1600, reserveBasis: 'net_income', capitalGainsRateBp: 2500, paturCeilingAgorot: 12_283_300, pensionAvgWageAgorot: 1_376_900, pensionLowRateBp: 445, pensionHighRateBp: 1255, vatDueDay: 15 }, '2026-01-01');
    const p = await previewIncome(db, 500_000, 'excl_vat', '2026-09-02');
    expect(p).toMatchObject({ net: 500_000, vat: 90_000, total: 590_000, incomeTaxReserve: 100_000, niReserve: 80_000, setAside: 270_000, leftForYou: 320_000 });

    const { tx } = await saveBusinessIncome(db, { amountAgorot: 500_000, mode: 'excl_vat', date: '2026-09-02', accountId: bank.id, received: true, payeeName: 'לקוח א' });
    expect(tx).toMatchObject({ amountAgorot: 590_000, context: 'business', business: { netAgorot: 500_000, vatAgorot: 90_000, incomeTaxRateBp: 2000 } });
    await saveBusinessIncome(db, { amountAgorot: 1_180_000, mode: 'incl_vat', date: '2026-10-20', accountId: bank.id, received: true });
    await saveBusinessExpense(db, { amountAgorot: 59_000, expenseClassId: (await cls(db, 'רכב פרטי')).id, date: '2026-09-10', accountId: bank.id });
    await saveBusinessExpense(db, { amountAgorot: 590_000, expenseClassId: (await cls(db, 'ציוד משרדי')).id, date: '2026-10-01', accountId: bank.id });

    const txs = await db.transactions.toArray();
    expect(accountBalance(bank.id, txs)).toBe(590_000 + 1_180_000 - 59_000 - 590_000);
    expect(summarizeFlows(txs, { from: '2026-09-01', to: '2026-10-31', context: 'business' }).income).toBe(500_000 + 1_000_000);

    const o = (await loadBusinessOverview(db, '2026-10-31'))!;
    const sepOct = o.vatReports.find((r) => r.key === '2026-09')!;
    expect(sepOct).toMatchObject({ outputVat: 270_000, inputVat: 96_000, vatDue: 174_000, paid: false, dueDate: '2026-11-15' });

    // 11.4 year to date: revenue (net), recognized expenses, profit, estimates, reserved.
    expect(o.revenueYtd).toBe(1_500_000);
    // fuel: (590 − 60) × 45% = 238.50; office: (5,900 − 900) × 100% = 5,000
    expect(o.recognizedExpensesYtd).toBe(23_850 + 500_000);
    expect(o.profitYtd).toBe(1_500_000 - 523_850);
    expect(o.estimatedIncomeTax).toBe(195_230); // 9,762.30 × 20%
    expect(o.reservedYtd).toBe(180_000 + 360_000);

    // VAT paid → the period is marked; it is not a recognized expense.
    await markVatPaid(db, '2026-09', 174_000, bank.id, '2026-11-15');
    const o2 = (await loadBusinessOverview(db, '2026-11-20'))!;
    expect(o2.vatReports.find((r) => r.key === '2026-09')?.paid).toBe(true);
    expect(o2.recognizedExpensesYtd).toBe(523_850);

    // Advances paid reduce the gap.
    await createTransaction(db, { kind: 'expense', amountAgorot: 100_000, date: '2026-11-15', accountId: bank.id, categoryId: SYSTEM_CATEGORY_IDS.incomeTaxAdvances, context: 'business', status: 'cleared' });
    const o3 = (await loadBusinessOverview(db, '2026-11-20'))!;
    expect(o3.paidYtd).toBe(100_000);
    expect(o3.gap).toBe(o3.estimatedIncomeTax! + o3.estimatedNi! - 100_000);

    // Move the set-aside to the tax reserve account.
    await moveToTaxReserve(db, bank.id, 270_000, '2026-09-02');
    expect(accountBalance(reserve.id, await db.transactions.toArray())).toBe(270_000);
  });

  it('exempt dealer: no VAT, turnover vs ceiling', async () => {
    const { db, bank } = await setup('exempt');
    await saveTaxSettings(db, { vatRateBp: 1800, incomeTaxRateBp: 1000, nationalInsuranceRateBp: 1000, reserveBasis: 'net_income', capitalGainsRateBp: 2500, paturCeilingAgorot: 12_283_300, pensionAvgWageAgorot: 1_376_900, pensionLowRateBp: 445, pensionHighRateBp: 1255, vatDueDay: 15 }, '2026-01-01');
    await saveBusinessIncome(db, { amountAgorot: 6_000_000, mode: 'incl_vat', date: '2026-03-15', accountId: bank.id, received: true });
    const o = (await loadBusinessOverview(db, '2026-04-10'))!;
    expect(o.vatReports).toHaveLength(0);
    expect(o.patur).toMatchObject({ turnoverYtd: 6_000_000, projected: 18_000_000, alerts: ['projected_over'] });
  });
});
