import type { FinanceDB } from '../db/db';
import { Payee, type Payee as PayeeT } from '../domain/schemas';
import { normalizeText } from '../calc/transactionFilter';
import { nowIso } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';

/** Finds a payee by exact (normalized) name or alias, or creates one. Used by the transaction form. */
export async function findOrCreatePayee(db: FinanceDB, name: string, defaultCategoryId?: string): Promise<PayeeT> {
  const n = normalizeText(name);
  const all = await db.payees.filter((p) => !p.deletedAt).toArray();
  const found = all.find((p) => normalizeText(p.name) === n || p.aliases.some((a) => normalizeText(a) === n));
  if (found) return found;
  const row = validate(Payee, compact({ ...newSystemFields(), name: name.trim(), aliases: [], defaultCategoryId }));
  await db.payees.add(row);
  return row;
}

/** Remembers the last category used for a payee as its default (a suggestion only, SPEC 6.7). */
export async function rememberPayeeCategory(db: FinanceDB, payeeId: string, categoryId: string | undefined): Promise<void> {
  if (!categoryId) return;
  await db.payees.update(payeeId, { defaultCategoryId: categoryId, updatedAt: nowIso() });
}
