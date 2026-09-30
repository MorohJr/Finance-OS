import type { FinanceDB } from '../db/db';
import { Debt, type Debt as DebtT, type DebtCharge, type Transaction as Tx } from '../domain/schemas';
import { nowIso, todayIL } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';
import { createTransaction } from './transactions';

/** Non-loan debts (owner request 01/10/2026). */

export type DebtInput = Omit<DebtT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'charges'> & { charges?: DebtCharge[] };

export async function saveDebt(db: FinanceDB, input: DebtInput, id?: string): Promise<DebtT> {
  const current = id ? await db.debts.get(id) : undefined;
  const row = validate(Debt, {
    ...(current ? { id: current.id, createdAt: current.createdAt, updatedAt: nowIso() } : newSystemFields()),
    charges: current?.charges ?? [],
    ...compact(input),
  });
  await db.debts.put(row);
  return row;
}

/** Soft delete. Payments already made stay: that money was really spent. */
export async function deleteDebt(db: FinanceDB, id: string): Promise<void> {
  const ts = nowIso();
  await db.debts.update(id, { deletedAt: ts, updatedAt: ts });
}

/** A fine, interest, legal fee or other charge added to the debt. */
export async function addDebtCharge(db: FinanceDB, debtId: string, charge: Omit<DebtCharge, 'id'>): Promise<void> {
  const d = await db.debts.get(debtId);
  if (!d) throw new Error('not_found');
  const row = validate(Debt, { ...d, charges: [...d.charges, { id: crypto.randomUUID(), ...compact(charge) }], updatedAt: nowIso() });
  await db.debts.put(row);
}

export async function removeDebtCharge(db: FinanceDB, debtId: string, chargeId: string): Promise<void> {
  const d = await db.debts.get(debtId);
  if (!d) throw new Error('not_found');
  await db.debts.put({ ...d, charges: d.charges.filter((c) => c.id !== chargeId), updatedAt: nowIso() });
}

/**
 * A payment toward the debt: an expense from the account, in the debt's category, linked to it.
 * (The debt was never recorded as an expense, so paying it is when the cost shows in cash flow.)
 */
export async function recordDebtPayment(db: FinanceDB, debtId: string, amountAgorot: number, accountId: string, date: string = todayIL()): Promise<Tx> {
  const d = await db.debts.get(debtId);
  if (!d) throw new Error('not_found');
  return createTransaction(db, {
    kind: 'expense',
    amountAgorot,
    date,
    accountId,
    categoryId: d.categoryId,
    context: d.context,
    status: 'cleared',
    source: 'manual',
    description: d.creditor,
    note: d.caseNumber ? `תיק ${d.caseNumber}` : undefined,
    links: { debtId },
  });
}
