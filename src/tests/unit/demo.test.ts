import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { FinanceDB, TABLE_NAMES } from '../../db/db';
import { createAccount } from '../../services/accounts';
import { createTransaction } from '../../services/transactions';
import { exitDemo, isDemoMode, loadDemo } from '../../services/demo/demo';
import { loadBusinessOverview } from '../../services/business';
import { accountBalance } from '../../calc/balance';
import { SETTINGS_ID } from '../../domain/schemas';

const names: string[] = [];
afterEach(async () => {
  while (names.length) {
    const n = names.pop()!;
    await Dexie.delete(n);
    await Dexie.delete(`${n}-demo-stash`);
  }
});

async function dump(db: FinanceDB) {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLE_NAMES) {
    const rows = await db.table(t).toArray();
    out[t] = rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  return out;
}

describe('demo mode', () => {
  it('fills every part of the app with a year of data, and restores the real data exactly', { timeout: 180_000 }, async () => {
    const name = `demo-${crypto.randomUUID()}`;
    names.push(name);
    const db = new FinanceDB(name);
    await db.open();
    const real = await createAccount(db, { name: 'החשבון האמיתי שלי', kind: 'bank', context: 'personal', isVisibleOnDashboard: true }, 123_456, '2026-01-01');
    await createTransaction(db, { kind: 'expense', amountAgorot: 4_200, date: '2026-09-01', accountId: real.id, context: 'personal', status: 'cleared' });
    await db.settings.update(SETTINGS_ID, { theme: 'dark' });
    const before = await dump(db);

    const steps: string[] = [];
    await loadDemo(db, (s) => steps.push(s), '2026-10-01');
    expect(await isDemoMode(db)).toBe(true);
    expect(steps.length).toBeGreaterThan(5);

    // Every user-facing table has data.
    for (const t of ['accounts', 'cards', 'transactions', 'cardStatements', 'installmentPlans', 'payees', 'categoryRules', 'recurring', 'wishItems', 'loans', 'lendings', 'debts', 'checks', 'netWorthSnapshots', 'securities', 'investmentTrades', 'pricePoints', 'fxRates', 'pensionFunds', 'pensionSnapshots', 'employers', 'payslips', 'businesses', 'budgetOverrides'] as const) {
      expect(await db.table(t).count(), t).toBeGreaterThan(0);
    }
    expect(await db.transactions.count()).toBeGreaterThan(600);
    expect(await db.accounts.filter((a) => a.name === 'החשבון האמיתי שלי').count()).toBe(0);
    // Settings kept (theme), card statements were charged to the bank, VAT periods paid.
    expect((await db.settings.get(SETTINGS_ID))?.theme).toBe('dark');
    expect(await db.transactions.where('kind').equals('card_payment').count()).toBeGreaterThan(20);
    const o = (await loadBusinessOverview(db, '2026-10-01'))!;
    expect(o.revenueYtd).toBeGreaterThan(0);
    expect(o.vatReports.filter((r) => r.paid).length).toBeGreaterThan(0);
    expect(await db.netWorthSnapshots.count()).toBe(12);
    // A rich family: the main account ends the year well in the black.
    const leumi = (await db.accounts.filter((a) => a.name === 'עו"ש לאומי').first())!;
    const leumiBalance = accountBalance(leumi.id, await db.transactions.toArray());
    expect(leumiBalance).toBeGreaterThan(30_000_00);
    expect(leumiBalance).toBeLessThan(400_000_00);
    // No account without an overdraft ends in the red (the trading account once did).
    const allTx = await db.transactions.toArray();
    for (const a of await db.accounts.toArray()) if (!a.overdraftLimit) expect(accountBalance(a.id, allTx), a.name).toBeGreaterThanOrEqual(0);
    // Usage-based bills are paid once a month, not repeatedly (regression).
    expect(await db.transactions.filter((t) => t.description === 'חשמל' && !t.links?.debtId).count()).toBeLessThanOrEqual(13);

    await expect(loadDemo(db, () => {}, '2026-10-01')).rejects.toThrow('already_in_demo');

    await exitDemo(db);
    expect(await isDemoMode(db)).toBe(false);
    expect(await dump(db)).toEqual(before);
    db.close();
  });
});
