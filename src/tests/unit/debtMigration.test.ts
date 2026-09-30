import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { FinanceDB, SCHEMA_V1 } from '../../db/db';
import { createAccount } from '../../services/accounts';
import { addDebtCharge, recordDebtPayment, saveDebt } from '../../services/debts2';
import { debtStatus } from '../../calc/debts';
import { accountBalance } from '../../calc/balance';
import { summarizeFlows } from '../../calc/cashflow';
import { exportBackup, parseBackup, restoreBackup } from '../../services/backup';

const names: string[] = [];
afterEach(async () => {
  while (names.length) await Dexie.delete(names.pop()!);
});

describe('schema v2 migration (iron rule 8)', () => {
  it('a v1 database with data opens as v2: data intact, debts table added', async () => {
    const name = `m-${crypto.randomUUID()}`;
    names.push(name);
    const old = new Dexie(name);
    old.version(1).stores(SCHEMA_V1);
    await old.open();
    await old.table('accounts').add({ id: crypto.randomUUID(), name: 'עו"ש', kind: 'bank', context: 'personal', isVisibleOnDashboard: true, status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    old.close();

    const db = new FinanceDB(name);
    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.accounts.count()).toBe(1);
    expect(await db.debts.count()).toBe(0);
    db.close();
  });

  it('a v1 backup file restores into v2', async () => {
    const name = `m2-${crypto.randomUUID()}`;
    names.push(name);
    const db = new FinanceDB(name);
    await db.open();
    const file = JSON.parse(await exportBackup(db));
    file.schemaVersion = 1;
    delete file.data.debts;
    const parsed = await parseBackup(JSON.stringify(file));
    expect(parsed.counts.debts).toBe(0);
    await restoreBackup(db, parsed);
    db.close();
  });
});

describe('debt services', () => {
  it('charges add to the balance; a payment is an expense from the account and reduces it', async () => {
    const name = `d2-${crypto.randomUUID()}`;
    names.push(name);
    const db = new FinanceDB(name);
    await db.open();
    const bank = await createAccount(db, { name: 'עו"ש', kind: 'bank', context: 'personal', isVisibleOnDashboard: true }, 500_000, '2026-01-01');
    const electricity = (await db.categories.filter((c) => c.name === 'חשמל').first())!;
    const d = await saveDebt(db, { creditor: 'חברת החשמל', kind: 'utility', originalAmountAgorot: 240_000, date: '2026-06-01', status: 'arrangement', monthlyPaymentAgorot: 60_000, paymentDay: 10, planStartDate: '2026-07-01', accountId: bank.id, categoryId: electricity.id, context: 'personal' });
    await addDebtCharge(db, d.id, { date: '2026-06-15', kind: 'interest', amountAgorot: 12_000 });
    await recordDebtPayment(db, d.id, 60_000, bank.id, '2026-07-10');
    const txs = await db.transactions.toArray();
    const s = debtStatus((await db.debts.get(d.id))!, txs, '2026-07-20');
    expect(s).toMatchObject({ total: 252_000, paid: 60_000, remaining: 192_000, overdue: false });
    expect(accountBalance(bank.id, txs)).toBe(440_000);
    expect(summarizeFlows(txs, { from: '2026-07-01', to: '2026-07-31' }).expenseByCategory.get(electricity.id)).toBe(60_000);
    db.close();
  });
});
