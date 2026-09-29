import type { FinanceDB } from '../db/db';
import { BudgetOverride, Recurring, type Recurring as RecurringT, type Transaction as Tx } from '../domain/schemas';
import { advance, isLive, recurringTxKind } from '../calc/recurring';
import { dayOfMonth, nowIso, todayIL } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';
import { saveTransactionWithInstallments } from './cards';

export type RecurringInput = Omit<RecurringT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function createRecurring(db: FinanceDB, input: RecurringInput): Promise<RecurringT> {
  const row = validate(Recurring, { ...newSystemFields(), anchorDay: dayOfMonth(input.nextDueDate), ...compact(input) });
  await db.recurring.add(row);
  return row;
}

export async function updateRecurring(db: FinanceDB, id: string, input: RecurringInput): Promise<RecurringT> {
  const current = await db.recurring.get(id);
  if (!current) throw new Error('not_found');
  // A manual change of the due date resets the anchor day.
  const anchorDay = input.nextDueDate !== current.nextDueDate ? dayOfMonth(input.nextDueDate) : current.anchorDay;
  const row = validate(Recurring, { id, createdAt: current.createdAt, updatedAt: nowIso(), anchorDay, ...compact(input) });
  await db.recurring.put(row);
  return row;
}

export async function deleteRecurring(db: FinanceDB, id: string): Promise<void> {
  const ts = nowIso();
  await db.recurring.update(id, { deletedAt: ts, updatedAt: ts });
}

async function contextOf(db: FinanceDB, r: RecurringT): Promise<Tx['context']> {
  if (r.cardId) return (await db.cards.get(r.cardId))?.context ?? 'personal';
  if (r.accountId) return (await db.accounts.get(r.accountId))?.context ?? 'personal';
  return 'personal';
}

/** The transaction a recurring item creates on a given date. */
async function txFor(db: FinanceDB, r: RecurringT, date: string, amountAgorot: number, status: Tx['status']) {
  const kind = recurringTxKind(r.kind);
  return {
    kind,
    amountAgorot,
    date,
    accountId: r.cardId ? undefined : r.accountId,
    cardId: r.cardId,
    toAccountId: kind === 'transfer' ? r.toAccountId : undefined,
    categoryId: kind === 'transfer' ? undefined : r.categoryId,
    paymentMethod: r.paymentMethod,
    description: r.name,
    context: await contextOf(db, r),
    status,
    source: 'system' as const,
    links: { recurringId: r.id },
  };
}

/**
 * "שולם" (10.4): creates a cleared transaction linked to the item and advances nextDueDate.
 * usage_based items need the actual amount.
 */
export async function markRecurringPaid(db: FinanceDB, id: string, options: { amountAgorot?: number; date?: string } = {}): Promise<Tx> {
  return db.transaction('rw', [db.recurring, db.transactions, db.cards, db.accounts, db.installmentPlans, db.cardStatements], async () => {
    const r = await db.recurring.get(id);
    if (!r || r.deletedAt) throw new Error('not_found');
    const amount = options.amountAgorot ?? r.amountAgorot;
    if (!amount || amount <= 0) throw new Error('amount_required');
    const t = await saveTransactionWithInstallments(db, undefined, { ...(await txFor(db, r, options.date ?? r.nextDueDate, amount, 'cleared')), source: 'manual' });
    await db.recurring.update(id, {
      nextDueDate: advance(r.nextDueDate, r.frequency, r.anchorDay),
      amountAgorot: r.frequency === 'usage_based' ? amount : r.amountAgorot,
      updatedAt: nowIso(),
    });
    return t;
  });
}

/**
 * autoCreate (10.4): at app open, a `pending` transaction for every due date that has passed.
 * The user confirms (→ cleared) or cancels. Idempotent: nextDueDate advances in the same transaction.
 */
export async function runRecurringAutoCreate(db: FinanceDB, today: string = todayIL()): Promise<number> {
  let created = 0;
  const items = await db.recurring.filter((r) => isLive(r) && r.autoCreate && r.frequency !== 'usage_based' && r.nextDueDate <= today).toArray();
  for (const item of items) {
    await db.transaction('rw', [db.recurring, db.transactions, db.cards, db.accounts, db.installmentPlans, db.cardStatements], async () => {
      const r = (await db.recurring.get(item.id))!;
      let next = r.nextDueDate;
      let guard = 0;
      while (next <= today && r.amountAgorot && guard++ < 400) {
        await saveTransactionWithInstallments(db, undefined, await txFor(db, r, next, r.amountAgorot, 'pending'));
        created++;
        next = advance(next, r.frequency, r.anchorDay);
      }
      await db.recurring.update(r.id, { nextDueDate: next, updatedAt: nowIso() });
    });
  }
  return created;
}

/** Confirm (→ cleared) or cancel (soft delete) a pending transaction. */
export async function resolvePending(db: FinanceDB, txId: string, confirm: boolean): Promise<void> {
  const ts = nowIso();
  await db.transactions.update(txId, confirm ? { status: 'cleared', updatedAt: ts } : { deletedAt: ts, updatedAt: ts });
}

/** Per-month budget override (SPEC 6.19). null removes it. */
export async function setBudgetOverride(db: FinanceDB, categoryId: string, month: string, amountAgorot: number | null): Promise<void> {
  const existing = await db.budgetOverrides.where('[categoryId+month]').equals([categoryId, month]).filter((o) => !o.deletedAt).first();
  const ts = nowIso();
  if (amountAgorot === null) {
    if (existing) await db.budgetOverrides.update(existing.id, { deletedAt: ts, updatedAt: ts });
    return;
  }
  if (existing) await db.budgetOverrides.update(existing.id, { amountAgorot, updatedAt: ts });
  else await db.budgetOverrides.add(validate(BudgetOverride, { ...newSystemFields(), categoryId, month, amountAgorot }));
}

export async function setCategoryBudget(db: FinanceDB, categoryId: string, amountAgorot: number | undefined): Promise<void> {
  await db.categories.where('id').equals(categoryId).modify((c) => {
    if (amountAgorot === undefined) delete c.monthlyBudget;
    else c.monthlyBudget = amountAgorot;
    c.updatedAt = nowIso();
  });
}

