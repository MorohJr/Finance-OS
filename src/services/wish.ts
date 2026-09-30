import type { FinanceDB } from '../db/db';
import { WishItem, type WishItem as WishT, type Transaction as Tx } from '../domain/schemas';
import { nowIso, todayIL } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';
import { createTransaction } from './transactions';
import { saveTransactionWithInstallments, syncCardStatements, type InstallmentInput } from './cards';

export type WishInput = Omit<WishT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function createWish(db: FinanceDB, input: WishInput): Promise<WishT> {
  const row = validate(WishItem, { ...newSystemFields(), ...compact(input) });
  await db.wishItems.add(row);
  return row;
}

export async function updateWish(db: FinanceDB, id: string, input: WishInput): Promise<WishT> {
  const current = await db.wishItems.get(id);
  if (!current) throw new Error('not_found');
  const row = validate(WishItem, { id, createdAt: current.createdAt, updatedAt: nowIso(), ...compact(input) });
  await db.wishItems.put(row);
  return row;
}

export async function deleteWish(db: FinanceDB, id: string): Promise<void> {
  const ts = nowIso();
  await db.wishItems.update(id, { deletedAt: ts, updatedAt: ts });
}

/** DECISION 15.2: saving toward an item is a transfer to its savings account, not income. */
export async function addSaving(db: FinanceDB, wishId: string, fromAccountId: string, amountAgorot: number, date: string = todayIL()): Promise<Tx> {
  const w = await db.wishItems.get(wishId);
  if (!w?.savingsAccountId) throw new Error('no_savings_account');
  const context = (await db.accounts.get(fromAccountId))?.context ?? 'personal';
  return createTransaction(db, { kind: 'transfer', amountAgorot, date, accountId: fromAccountId, toAccountId: w.savingsAccountId, context, status: 'cleared', source: 'manual', description: w.name, links: { wishItemId: wishId } });
}

/** Buying the item: an expense (or a card purchase with installments) linked to it. */
export async function recordWishPurchase(
  db: FinanceDB,
  wishId: string,
  source: { accountId?: string; cardId?: string },
  amountAgorot: number,
  date: string = todayIL(),
  installments?: InstallmentInput,
): Promise<Tx> {
  const w = await db.wishItems.get(wishId);
  if (!w) throw new Error('not_found');
  const t = await saveTransactionWithInstallments(
    db,
    undefined,
    { kind: 'expense', amountAgorot, date, ...source, context: 'personal', status: 'cleared', source: 'manual', description: w.name, links: { wishItemId: wishId } },
    installments,
  );
  if (source.cardId) await syncCardStatements(db);
  return t;
}
