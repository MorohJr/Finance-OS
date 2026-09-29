import type { FinanceDB } from '../db/db';
import { Transaction, type Transaction as Tx } from '../domain/schemas';
import { nowIso } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';

export type TransactionInput = Omit<Tx, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'source' | 'tags' | 'attachmentIds'> & {
  source?: Tx['source'];
  tags?: string[];
  attachmentIds?: string[];
};

/** Creates a validated transaction. Money is integer agorot; the schema enforces it. */
export async function createTransaction(db: FinanceDB, input: TransactionInput): Promise<Tx> {
  const row = validate(Transaction, { ...newSystemFields(), source: 'manual', tags: [], attachmentIds: [], ...compact(input) });
  if (row.kind === 'opening_balance' && row.accountId) {
    // SPEC 6.3: one opening balance per account.
    const existing = await findOpeningBalance(db, row.accountId);
    if (existing) throw new Error('opening_balance_exists');
  }
  await db.transactions.add(row);
  return row;
}

export async function updateTransaction(db: FinanceDB, id: string, input: TransactionInput): Promise<Tx> {
  const current = await db.transactions.get(id);
  if (!current || current.deletedAt) throw new Error('not_found');
  // Replace the editable fields; keep system fields and links set by the system.
  const row = validate(
    Transaction,
    compact({ id, createdAt: current.createdAt, updatedAt: nowIso(), source: current.source, importHash: current.importHash, links: current.links, tags: [], attachmentIds: current.attachmentIds, ...compact(input) }),
  );
  if (row.kind === 'opening_balance' && row.accountId) {
    const existing = await findOpeningBalance(db, row.accountId);
    if (existing && existing.id !== id) throw new Error('opening_balance_exists');
  }
  await db.transactions.put(row);
  return row;
}

/** Soft delete (SPEC 4). Returns an undo function. */
export async function deleteTransaction(db: FinanceDB, id: string): Promise<() => Promise<void>> {
  const ts = nowIso();
  await db.transactions.update(id, { deletedAt: ts, updatedAt: ts });
  return async () => {
    await db.transactions.where('id').equals(id).modify((t) => {
      delete t.deletedAt;
      t.updatedAt = nowIso();
    });
  };
}

export async function findOpeningBalance(db: FinanceDB, accountId: string): Promise<Tx | undefined> {
  return db.transactions
    .where('accountId')
    .equals(accountId)
    .filter((t) => t.kind === 'opening_balance' && !t.deletedAt)
    .first();
}

export async function activeTransactions(db: FinanceDB): Promise<Tx[]> {
  return db.transactions.filter((t) => !t.deletedAt).toArray();
}
