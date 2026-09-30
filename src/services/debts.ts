import type { FinanceDB } from '../db/db';
import { Check, Lending, Loan, type Check as CheckT, type Lending as LendingT, type Loan as LoanT, type Transaction as Tx } from '../domain/schemas';
import { loanStatus } from '../calc/loans';
import { nowIso, todayIL } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';
import { createTransaction } from './transactions';

async function contextOfAccount(db: FinanceDB, accountId: string): Promise<Tx['context']> {
  return (await db.accounts.get(accountId))?.context ?? 'personal';
}

async function softDeleteLinked(db: FinanceDB, key: 'loanId' | 'lendingId' | 'checkId', id: string) {
  const ts = nowIso();
  const txs = await db.transactions.filter((t) => t.links?.[key] === id && !t.deletedAt).toArray();
  for (const t of txs) await db.transactions.update(t.id, { deletedAt: ts, updatedAt: ts });
}

// ---------------------------------------------------------------------------
// Loans I took (6.10)
// ---------------------------------------------------------------------------

export type LoanInput = Omit<LoanT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/**
 * Creates a loan. If the money came into an account: a `loan_disbursement` for the principal,
 * and the opening/discount fees as a separate expense, so the account nets principal − fees.
 */
export async function createLoan(db: FinanceDB, input: LoanInput): Promise<LoanT> {
  const loan = validate(Loan, { ...newSystemFields(), ...compact(input) });
  await db.transaction('rw', [db.loans, db.transactions, db.accounts, db.categories], async () => {
    await db.loans.add(loan);
    if (loan.receivedToAccountId) {
      const context = await contextOfAccount(db, loan.receivedToAccountId);
      await createTransaction(db, { kind: 'loan_disbursement', amountAgorot: loan.principalAgorot, date: loan.startDate, accountId: loan.receivedToAccountId, context, status: 'cleared', source: 'system', description: loan.name, links: { loanId: loan.id } });
      if (loan.feesAgorot) {
        const fees = await db.categories.filter((c) => c.name === 'עמלות בנק' && !c.deletedAt).first();
        await createTransaction(db, { kind: 'expense', amountAgorot: loan.feesAgorot, date: loan.startDate, accountId: loan.receivedToAccountId, categoryId: fees?.id, context, status: 'cleared', source: 'system', description: loan.name, links: { loanId: loan.id } });
      }
    }
  });
  return loan;
}

export async function updateLoan(db: FinanceDB, id: string, input: LoanInput): Promise<LoanT> {
  const current = await db.loans.get(id);
  if (!current) throw new Error('not_found');
  const row = validate(Loan, { id, createdAt: current.createdAt, updatedAt: nowIso(), ...compact(input) });
  await db.loans.put(row);
  return row;
}

export async function deleteLoan(db: FinanceDB, id: string): Promise<void> {
  const ts = nowIso();
  await db.transaction('rw', db.loans, db.transactions, async () => {
    await softDeleteLinked(db, 'loanId', id);
    await db.loans.update(id, { deletedAt: ts, updatedAt: ts });
  });
}

/** Records an actual payment (`loan_payment`) from the loan's account. Default: the next scheduled amount. */
export async function recordLoanPayment(db: FinanceDB, loanId: string, options: { amountAgorot?: number; date?: string } = {}): Promise<Tx> {
  const loan = await db.loans.get(loanId);
  if (!loan) throw new Error('not_found');
  const payments = await db.transactions.filter((t) => t.links?.loanId === loanId).toArray();
  const status = loanStatus(loan, payments, todayIL());
  const amount = options.amountAgorot ?? status.nextPayment?.payment;
  if (!amount || amount <= 0) throw new Error('nothing_due');
  return createTransaction(db, {
    kind: 'loan_payment',
    amountAgorot: amount,
    date: options.date ?? status.nextPayment?.date ?? todayIL(),
    accountId: loan.accountId,
    context: await contextOfAccount(db, loan.accountId),
    status: 'cleared',
    source: 'manual',
    description: loan.name,
    links: { loanId },
  });
}

// ---------------------------------------------------------------------------
// Loans I gave (6.11)
// ---------------------------------------------------------------------------

export type LendingInput = Omit<LendingT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function createLending(db: FinanceDB, input: LendingInput): Promise<LendingT> {
  const row = validate(Lending, { ...newSystemFields(), ...compact(input) });
  await db.transaction('rw', [db.lendings, db.transactions, db.accounts], async () => {
    await db.lendings.add(row);
    await createTransaction(db, { kind: 'lending_out', amountAgorot: row.principalAgorot, date: row.date, accountId: row.fromAccountId, context: await contextOfAccount(db, row.fromAccountId), status: 'cleared', source: 'system', description: row.borrowerName, links: { lendingId: row.id } });
  });
  return row;
}

export async function updateLending(db: FinanceDB, id: string, input: LendingInput): Promise<LendingT> {
  const current = await db.lendings.get(id);
  if (!current) throw new Error('not_found');
  const row = validate(Lending, { id, createdAt: current.createdAt, updatedAt: nowIso(), ...compact(input) });
  await db.transaction('rw', db.lendings, db.transactions, async () => {
    await db.lendings.put(row);
    // Keep the original lending_out in sync with the loan terms.
    const out = await db.transactions.filter((t) => t.links?.lendingId === id && t.kind === 'lending_out' && !t.deletedAt).first();
    if (out) await db.transactions.update(out.id, { amountAgorot: row.principalAgorot, date: row.date, accountId: row.fromAccountId, description: row.borrowerName, updatedAt: nowIso() });
  });
  return row;
}

export async function deleteLending(db: FinanceDB, id: string): Promise<void> {
  const ts = nowIso();
  await db.transaction('rw', db.lendings, db.transactions, async () => {
    await softDeleteLinked(db, 'lendingId', id);
    await db.lendings.update(id, { deletedAt: ts, updatedAt: ts });
  });
}

export async function recordRepayment(db: FinanceDB, lendingId: string, amountAgorot: number, accountId: string, date: string = todayIL()): Promise<Tx> {
  const l = await db.lendings.get(lendingId);
  if (!l) throw new Error('not_found');
  return createTransaction(db, { kind: 'lending_repayment', amountAgorot, date, accountId, context: await contextOfAccount(db, accountId), status: 'cleared', source: 'manual', description: l.borrowerName, links: { lendingId } });
}

// ---------------------------------------------------------------------------
// Checks (6.12)
// ---------------------------------------------------------------------------

export type CheckInput = Omit<CheckT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

function checkTx(c: CheckT): Parameters<typeof createTransaction>[1] {
  return {
    kind: c.direction === 'issued' ? 'expense' : 'income',
    amountAgorot: c.amountAgorot,
    date: c.dueDate,
    accountId: c.accountId,
    categoryId: c.categoryId,
    context: c.context,
    status: c.status === 'cleared' ? 'cleared' : 'pending',
    source: 'system',
    paymentMethod: 'check',
    description: `צ'ק ${c.number} · ${c.counterparty}`,
    note: c.note,
    links: { checkId: c.id },
  };
}

/** Creating a check creates a `pending` transaction on its due date (it enters the forecast). */
export async function createCheck(db: FinanceDB, input: CheckInput): Promise<CheckT> {
  const row = validate(Check, { ...newSystemFields(), ...compact(input) });
  await db.transaction('rw', db.checks, db.transactions, async () => {
    await db.checks.add(row);
    if (row.status !== 'bounced' && row.status !== 'cancelled' && row.status !== 'discounted') await createTransaction(db, checkTx(row));
  });
  return row;
}

/**
 * Status changes (6.12): cleared → the transaction clears; bounced / cancelled / discounted → it's
 * cancelled (a discounted check's money came as a loan). Back to pending/deposited → pending again.
 */
export async function updateCheck(db: FinanceDB, id: string, input: CheckInput): Promise<CheckT> {
  const current = await db.checks.get(id);
  if (!current) throw new Error('not_found');
  const row = validate(Check, { id, createdAt: current.createdAt, updatedAt: nowIso(), ...compact(input) });
  await db.transaction('rw', db.checks, db.transactions, async () => {
    await db.checks.put(row);
    const existing = await db.transactions.filter((t) => t.links?.checkId === id && !t.deletedAt).first();
    const ts = nowIso();
    const dead = row.status === 'bounced' || row.status === 'cancelled' || row.status === 'discounted';
    if (dead) {
      if (existing) await db.transactions.update(existing.id, { deletedAt: ts, updatedAt: ts });
    } else if (existing) {
      const t = checkTx(row);
      await db.transactions.update(existing.id, { kind: t.kind, amountAgorot: t.amountAgorot, date: t.date, accountId: t.accountId, categoryId: t.categoryId, context: t.context, status: t.status, description: t.description, updatedAt: ts });
    } else {
      await createTransaction(db, checkTx(row));
    }
  });
  return row;
}

export async function setCheckStatus(db: FinanceDB, id: string, status: CheckT['status']): Promise<void> {
  const c = await db.checks.get(id);
  if (!c) throw new Error('not_found');
  const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = c;
  await updateCheck(db, id, { ...rest, status });
}

export async function deleteCheck(db: FinanceDB, id: string): Promise<void> {
  const ts = nowIso();
  await db.transaction('rw', db.checks, db.transactions, async () => {
    await softDeleteLinked(db, 'checkId', id);
    await db.checks.update(id, { deletedAt: ts, updatedAt: ts });
  });
}
