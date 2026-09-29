import type { FinanceDB } from '../db/db';
import { Account, type Account as AccountT } from '../domain/schemas';
import { accountBalance } from '../calc/balance';
import { nowIso, todayIL } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';
import { createTransaction, findOpeningBalance } from './transactions';

export type AccountInput = Omit<AccountT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'status'> & { status?: AccountT['status'] };

/**
 * Creates an account. A non-zero opening balance becomes an `opening_balance` transaction
 * (SPEC 5.2); the balance itself is never stored.
 */
export async function createAccount(db: FinanceDB, input: AccountInput, openingBalance = 0, openingDate = todayIL()): Promise<AccountT> {
  const count = await db.accounts.count();
  const row = validate(Account, compact({ ...newSystemFields(), status: 'active', sortOrder: count, ...compact(input) }));
  await db.transaction('rw', db.accounts, db.transactions, async () => {
    await db.accounts.add(row);
    if (openingBalance !== 0) {
      await createTransaction(db, {
        kind: 'opening_balance',
        direction: openingBalance > 0 ? 'in' : 'out',
        amountAgorot: Math.abs(openingBalance),
        accountId: row.id,
        date: openingDate,
        context: row.context,
        status: 'cleared',
        source: 'manual',
      });
    }
  });
  return row;
}

export async function updateAccount(db: FinanceDB, id: string, input: AccountInput): Promise<AccountT> {
  const current = await db.accounts.get(id);
  if (!current) throw new Error('not_found');
  const row = validate(Account, compact({ id, createdAt: current.createdAt, updatedAt: nowIso(), status: current.status, sortOrder: current.sortOrder, ...compact(input) }));
  await db.accounts.put(row);
  return row;
}

async function balanceOf(db: FinanceDB, id: string): Promise<number> {
  const txs = await db.transactions.filter((t) => t.accountId === id || t.toAccountId === id).toArray();
  return accountBalance(id, txs);
}

/** SPEC 6.1: closing is allowed only at balance 0. */
export async function setAccountStatus(db: FinanceDB, id: string, status: AccountT['status']): Promise<void> {
  if (status === 'closed' && (await balanceOf(db, id)) !== 0) throw new Error('balance_not_zero');
  await db.accounts.update(id, { status, updatedAt: nowIso() });
}

/** Soft delete, only for an account with no transactions other than its opening balance. Otherwise close it. */
export async function deleteAccount(db: FinanceDB, id: string): Promise<void> {
  const txs = await db.transactions.filter((t) => !t.deletedAt && (t.accountId === id || t.toAccountId === id)).toArray();
  if (txs.some((t) => t.kind !== 'opening_balance')) throw new Error('has_transactions');
  const cards = await db.cards.filter((c) => !c.deletedAt && c.billingAccountId === id).count();
  if (cards) throw new Error('has_cards');
  const ts = nowIso();
  await db.transaction('rw', db.accounts, db.transactions, async () => {
    for (const t of txs) await db.transactions.update(t.id, { deletedAt: ts, updatedAt: ts });
    await db.accounts.update(id, { deletedAt: ts, updatedAt: ts });
  });
}

/** Current opening balance of an account as a signed amount (for the edit form). */
export async function openingBalanceOf(db: FinanceDB, accountId: string): Promise<{ amount: number; date: string } | undefined> {
  const t = await findOpeningBalance(db, accountId);
  if (!t) return undefined;
  return { amount: t.direction === 'out' ? -t.amountAgorot : t.amountAgorot, date: t.date };
}

export async function reorderAccounts(db: FinanceDB, orderedIds: string[]): Promise<void> {
  const ts = nowIso();
  await db.transaction('rw', db.accounts, async () => {
    for (const [i, id] of orderedIds.entries()) await db.accounts.update(id, { sortOrder: i, updatedAt: ts });
  });
}

/**
 * Sets the opening balance (signed agorot). 0 removes it. Keeps the one-per-account rule (SPEC 6.3).
 */
export async function setOpeningBalance(db: FinanceDB, accountId: string, amount: number, date: string): Promise<void> {
  const account = await db.accounts.get(accountId);
  if (!account) throw new Error('not_found');
  await db.transaction('rw', db.transactions, async () => {
    const existing = await findOpeningBalance(db, accountId);
    const ts = nowIso();
    if (amount === 0) {
      if (existing) await db.transactions.update(existing.id, { deletedAt: ts, updatedAt: ts });
      return;
    }
    const fields = { direction: amount > 0 ? ('in' as const) : ('out' as const), amountAgorot: Math.abs(amount), date };
    if (existing) {
      await db.transactions.update(existing.id, { ...fields, updatedAt: ts });
    } else {
      await createTransaction(db, { kind: 'opening_balance', ...fields, accountId, context: account.context, status: 'cleared' });
    }
  });
}
