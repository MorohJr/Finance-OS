import { afterEach, describe, expect, it } from 'vitest';
import { FinanceDB } from '../../db/db';
import { createAccount } from '../../services/accounts';
import { createRecurring, markRecurringPaid, resolvePending, runRecurringAutoCreate, setBudgetOverride, updateRecurring } from '../../services/recurring';
import { accountBalance } from '../../calc/balance';

const dbs: FinanceDB[] = [];
afterEach(async () => {
  while (dbs.length) await dbs.pop()!.delete();
});

async function setup() {
  const db = new FinanceDB(`r-${crypto.randomUUID()}`);
  dbs.push(db);
  await db.open();
  const bank = await createAccount(db, { name: 'עו"ש', kind: 'bank', context: 'personal', isVisibleOnDashboard: true }, 1_000_000, '2026-01-01');
  const savings = await createAccount(db, { name: 'חיסכון', kind: 'savings', context: 'personal', isVisibleOnDashboard: true });
  return { db, bank, savings };
}

describe('recurring services (stage 3)', () => {
  it('mark paid creates a linked transaction and advances by frequency (bimonthly)', async () => {
    const { db, bank } = await setup();
    const r = await createRecurring(db, { name: 'ארנונה', kind: 'bill', amountAgorot: 64_000, frequency: 'bimonthly', nextDueDate: '2026-01-31', accountId: bank.id, status: 'active', autoCreate: false });
    expect(r.anchorDay).toBe(31);
    const t = await markRecurringPaid(db, r.id);
    expect(t).toMatchObject({ kind: 'expense', amountAgorot: 64_000, date: '2026-01-31', links: { recurringId: r.id } });
    expect((await db.recurring.get(r.id))?.nextDueDate).toBe('2026-03-31');
    await markRecurringPaid(db, r.id);
    await markRecurringPaid(db, r.id);
    expect((await db.recurring.get(r.id))?.nextDueDate).toBe('2026-07-31');
  });

  it('usage_based needs the amount and remembers it', async () => {
    const { db, bank } = await setup();
    const r = await createRecurring(db, { name: 'חשמל', kind: 'bill', frequency: 'usage_based', nextDueDate: '2026-02-15', accountId: bank.id, status: 'active', autoCreate: false });
    await expect(markRecurringPaid(db, r.id)).rejects.toThrow('amount_required');
    await markRecurringPaid(db, r.id, { amountAgorot: 45_000 });
    expect((await db.recurring.get(r.id))).toMatchObject({ amountAgorot: 45_000, nextDueDate: '2026-02-15' });
  });

  it('autoCreate makes pending transactions for every passed date, once; confirm/cancel', async () => {
    const { db, bank, savings } = await setup();
    await createRecurring(db, { name: 'הוראת קבע לחיסכון', kind: 'transfer', amountAgorot: 50_000, frequency: 'monthly', nextDueDate: '2026-07-01', accountId: bank.id, toAccountId: savings.id, status: 'active', autoCreate: true });
    expect(await runRecurringAutoCreate(db, '2026-09-15')).toBe(3);
    expect(await runRecurringAutoCreate(db, '2026-09-15')).toBe(0);
    const pending = await db.transactions.where('status').equals('pending').sortBy('date');
    expect(pending.map((t) => t.date)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
    // Pending doesn't move balances until confirmed.
    expect(accountBalance(savings.id, await db.transactions.toArray())).toBe(0);
    await resolvePending(db, pending[0]!.id, true);
    await resolvePending(db, pending[1]!.id, false);
    const all = await db.transactions.toArray();
    expect(accountBalance(savings.id, all)).toBe(50_000);
    expect(accountBalance(bank.id, all)).toBe(950_000);
  });

  it('transfer requires a different destination account', async () => {
    const { db, bank } = await setup();
    await expect(createRecurring(db, { name: 'x', kind: 'transfer', amountAgorot: 1, frequency: 'monthly', nextDueDate: '2026-01-01', accountId: bank.id, status: 'active', autoCreate: false })).rejects.toThrow();
  });

  it('changing the due date resets the anchor day', async () => {
    const { db, bank } = await setup();
    const r = await createRecurring(db, { name: 'x', kind: 'bill', amountAgorot: 1, frequency: 'monthly', nextDueDate: '2026-01-31', accountId: bank.id, status: 'active', autoCreate: false });
    const u = await updateRecurring(db, r.id, { name: 'x', kind: 'bill', amountAgorot: 1, frequency: 'monthly', nextDueDate: '2026-02-10', accountId: bank.id, status: 'active', autoCreate: false });
    expect(u.anchorDay).toBe(10);
  });

  it('budget override per month', async () => {
    const { db } = await setup();
    const cat = (await db.categories.where('type').equals('expense').first())!;
    await setBudgetOverride(db, cat.id, '2026-09', 10_000);
    await setBudgetOverride(db, cat.id, '2026-09', 20_000);
    expect((await db.budgetOverrides.toArray()).filter((o) => !o.deletedAt)).toHaveLength(1);
    await setBudgetOverride(db, cat.id, '2026-09', null);
    expect((await db.budgetOverrides.toArray()).filter((o) => !o.deletedAt)).toHaveLength(0);
  });
});
