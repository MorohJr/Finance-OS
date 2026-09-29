import { afterEach, describe, expect, it } from 'vitest';
import { FinanceDB } from '../../db/db';
import { createAccount, deleteAccount, openingBalanceOf, setAccountStatus, setOpeningBalance } from '../../services/accounts';
import { createTransaction, deleteTransaction, updateTransaction } from '../../services/transactions';
import { createCategory, deleteCategory } from '../../services/categories';
import { findOrCreatePayee } from '../../services/payees';
import { accountBalance } from '../../calc/balance';
import { summarizeFlows } from '../../calc/cashflow';
import { ValidationError } from '../../services/entity';
import { clearPin, isValidPin, setPin, shouldLock, verifyPin, LOCK_AFTER_MS } from '../../services/pin';
import { SETTINGS_ID } from '../../domain/schemas';

const dbs: FinanceDB[] = [];
async function freshDb() {
  const db = new FinanceDB(`s-${crypto.randomUUID()}`);
  dbs.push(db);
  await db.open();
  return db;
}
afterEach(async () => {
  while (dbs.length) await dbs.pop()!.delete();
});

const bankInput = { name: 'עו"ש', kind: 'bank' as const, context: 'personal' as const, isVisibleOnDashboard: true };

async function balance(db: FinanceDB, id: string) {
  return accountBalance(id, await db.transactions.toArray());
}

describe('accounts service', () => {
  it('opening balance is a transaction, not a field (iron rule 2)', async () => {
    const db = await freshDb();
    const acc = await createAccount(db, bankInput, -150_000, '2026-09-01');
    expect(acc).not.toHaveProperty('balance');
    expect(await balance(db, acc.id)).toBe(-150_000);
    expect(await openingBalanceOf(db, acc.id)).toEqual({ amount: -150_000, date: '2026-09-01' });

    await setOpeningBalance(db, acc.id, 20_000, '2026-09-01');
    expect(await balance(db, acc.id)).toBe(20_000);
    await setOpeningBalance(db, acc.id, 0, '2026-09-01');
    expect(await balance(db, acc.id)).toBe(0);
  });

  it('only one opening balance per account', async () => {
    const db = await freshDb();
    const acc = await createAccount(db, bankInput, 1000);
    await expect(
      createTransaction(db, { kind: 'opening_balance', direction: 'in', amountAgorot: 5, accountId: acc.id, date: '2026-09-01', context: 'personal', status: 'cleared' }),
    ).rejects.toThrow('opening_balance_exists');
  });

  it('closing is allowed only at balance 0', async () => {
    const db = await freshDb();
    const acc = await createAccount(db, bankInput, 1000);
    await expect(setAccountStatus(db, acc.id, 'closed')).rejects.toThrow('balance_not_zero');
    await createTransaction(db, { kind: 'expense', amountAgorot: 1000, accountId: acc.id, date: '2026-09-02', context: 'personal', status: 'cleared' });
    await setAccountStatus(db, acc.id, 'closed');
    expect((await db.accounts.get(acc.id))?.status).toBe('closed');
  });

  it('delete only without real transactions', async () => {
    const db = await freshDb();
    const acc = await createAccount(db, bankInput, 1000);
    await createTransaction(db, { kind: 'income', amountAgorot: 1, accountId: acc.id, date: '2026-09-02', context: 'personal', status: 'cleared' });
    await expect(deleteAccount(db, acc.id)).rejects.toThrow('has_transactions');
    const empty = await createAccount(db, { ...bankInput, name: 'ריק' }, 500);
    await deleteAccount(db, empty.id);
    expect((await db.accounts.get(empty.id))?.deletedAt).toBeDefined();
  });
});

describe('transactions service', () => {
  it('transfer moves money without income or expense (acceptance, stage 1)', async () => {
    const db = await freshDb();
    const a = await createAccount(db, bankInput, 100_000, '2026-09-01');
    const b = await createAccount(db, { ...bankInput, name: 'חיסכון', kind: 'savings' }, 0);
    await createTransaction(db, { kind: 'transfer', amountAgorot: 30_000, accountId: a.id, toAccountId: b.id, date: '2026-09-10', context: 'personal', status: 'cleared' });
    expect(await balance(db, a.id)).toBe(70_000);
    expect(await balance(db, b.id)).toBe(30_000);
    const flows = summarizeFlows(await db.transactions.toArray(), { from: '2026-09-01', to: '2026-09-30' });
    expect(flows.income).toBe(0);
    expect(flows.expense).toBe(0);
  });

  it('undefined optional fields from a form do not override defaults (regression)', async () => {
    const db = await freshDb();
    const a = await createAccount(db, bankInput);
    const t = await createTransaction(db, { kind: 'income', amountAgorot: 100, accountId: a.id, date: '2026-09-10', context: 'personal', status: 'cleared', source: undefined, business: undefined, cardId: undefined });
    expect(t.source).toBe('manual');
  });

  it('rejects invalid input with field paths', async () => {
    const db = await freshDb();
    const a = await createAccount(db, bankInput);
    const err = await createTransaction(db, { kind: 'adjustment', direction: 'in', amountAgorot: 100, accountId: a.id, date: '2026-09-10', context: 'personal', status: 'cleared' }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).issues[0]?.path).toBe('note');
  });

  it('edit keeps system fields; delete is soft with undo', async () => {
    const db = await freshDb();
    const a = await createAccount(db, bankInput);
    const t = await createTransaction(db, { kind: 'expense', amountAgorot: 500, accountId: a.id, date: '2026-09-10', context: 'personal', status: 'cleared' });
    const edited = await updateTransaction(db, t.id, { kind: 'expense', amountAgorot: 700, accountId: a.id, date: '2026-09-10', context: 'personal', status: 'cleared', description: 'קפה' });
    expect(edited.createdAt).toBe(t.createdAt);
    expect(await balance(db, a.id)).toBe(-700);
    const undo = await deleteTransaction(db, t.id);
    expect(await balance(db, a.id)).toBe(0);
    expect(await db.transactions.get(t.id)).toBeDefined();
    await undo();
    expect(await balance(db, a.id)).toBe(-700);
  });
});

describe('categories and payees', () => {
  it('one level of sub-categories, same type', async () => {
    const db = await freshDb();
    const parent = await createCategory(db, { name: 'רכב', type: 'expense', includeInBudget: true, context: 'personal' });
    const child = await createCategory(db, { name: 'דלק', type: 'expense', includeInBudget: true, context: 'personal', parentId: parent.id });
    await expect(createCategory(db, { name: 'x', type: 'expense', includeInBudget: true, context: 'personal', parentId: child.id })).rejects.toThrow('parent_too_deep');
    await expect(createCategory(db, { name: 'x', type: 'income', includeInBudget: false, context: 'personal', parentId: parent.id })).rejects.toThrow('parent_type');
    await deleteCategory(db, parent.id);
    expect((await db.categories.get(child.id))?.parentId).toBeUndefined();
  });

  it('payee lookup by name or alias', async () => {
    const db = await freshDb();
    const p = await findOrCreatePayee(db, 'רמי לוי');
    await db.payees.update(p.id, { aliases: ['RAMI LEVI'] });
    expect((await findOrCreatePayee(db, 'rami levi')).id).toBe(p.id);
    expect(await db.payees.count()).toBe(1);
  });
});

describe('PIN', () => {
  it('stores a salted hash only, verifies, clears', async () => {
    const db = await freshDb();
    expect(isValidPin('12')).toBe(false);
    await setPin(db, '4821');
    const s = (await db.settings.get(SETTINGS_ID))!;
    expect(JSON.stringify(s)).not.toContain('4821');
    expect(await verifyPin('4821', s.pinHash!, s.pinSalt!)).toBe(true);
    expect(await verifyPin('0000', s.pinHash!, s.pinSalt!)).toBe(false);
    await clearPin(db);
    expect((await db.settings.get(SETTINGS_ID))?.pinHash).toBeUndefined();
  });
  it('locks after 5 minutes in the background', () => {
    expect(shouldLock(null, 1e9)).toBe(false);
    expect(shouldLock(0, LOCK_AFTER_MS - 1)).toBe(false);
    expect(shouldLock(0, LOCK_AFTER_MS)).toBe(true);
  });
});
