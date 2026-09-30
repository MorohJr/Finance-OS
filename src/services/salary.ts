import type { FinanceDB } from '../db/db';
import { Employer, Payslip, PensionSnapshot, type Employer as EmployerT, type Payslip as PayslipT } from '../domain/schemas';
import { payDate } from '../calc/salary';
import { nowIso, todayIL } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';
import { createTransaction } from './transactions';

export type EmployerInput = Omit<EmployerT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type PayslipInput = Omit<PayslipT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function saveEmployer(db: FinanceDB, input: EmployerInput, id?: string): Promise<EmployerT> {
  const current = id ? await db.employers.get(id) : undefined;
  const row = validate(Employer, { ...(current ? { id: current.id, createdAt: current.createdAt, updatedAt: nowIso() } : newSystemFields()), ...compact(input) });
  await db.employers.put(row);
  return row;
}

export async function deleteEmployer(db: FinanceDB, id: string): Promise<void> {
  const has = await db.payslips.where('employerId').equals(id).filter((p) => !p.deletedAt).count();
  if (has) throw new Error('has_payslips');
  const ts = nowIso();
  await db.employers.update(id, { deletedAt: ts, updatedAt: ts });
}

/**
 * Saves a payslip (6.16) and keeps what it creates in sync:
 * - an `income` of the net amount into the deposit account on the pay date (pending while in the future),
 * - a PensionSnapshot delta on the employer's fund (employee + employer + severance).
 */
export async function savePayslip(db: FinanceDB, input: PayslipInput, id?: string, today: string = todayIL()): Promise<PayslipT> {
  return db.transaction('rw', [db.payslips, db.employers, db.transactions, db.pensionSnapshots, db.categories, db.accounts], async () => {
    const current = id ? await db.payslips.get(id) : undefined;
    const row = validate(Payslip, { ...(current ? { id: current.id, createdAt: current.createdAt, updatedAt: nowIso() } : newSystemFields()), ...compact(input) });
    await db.payslips.put(row);
    const employer = await db.employers.get(row.employerId);
    if (!employer) throw new Error('employer_not_found');
    const date = payDate(row.month, employer.payDay);
    const ts = nowIso();

    // Income transaction.
    const existingTx = await db.transactions.filter((t) => t.links?.payslipId === row.id && !t.deletedAt).first();
    if (employer.depositAccountId && row.netAgorot > 0) {
      const fields = { amountAgorot: row.netAgorot, date, accountId: employer.depositAccountId, status: date > today ? ('pending' as const) : ('cleared' as const), description: employer.name };
      if (existingTx) await db.transactions.update(existingTx.id, { ...fields, updatedAt: ts });
      else {
        const salary = await db.categories.filter((c) => c.name === 'משכורת' && c.type === 'income' && !c.deletedAt).first();
        const context = (await db.accounts.get(employer.depositAccountId))?.context ?? 'personal';
        await createTransaction(db, { kind: 'income', ...fields, categoryId: salary?.id, context, source: 'system', paymentMethod: 'bank', links: { payslipId: row.id } });
      }
    } else if (existingTx) {
      await db.transactions.update(existingTx.id, { deletedAt: ts, updatedAt: ts });
    }

    // Pension deposit delta.
    const existingSnap = await db.pensionSnapshots.filter((s) => s.payslipId === row.id && !s.deletedAt).first();
    const deposits = (row.pensionEmployeeAgorot ?? 0) + (row.pensionEmployerAgorot ?? 0) + (row.severanceAgorot ?? 0);
    if (employer.pensionFundId && deposits > 0) {
      const earlier = (await db.pensionSnapshots.where('fundId').equals(employer.pensionFundId).filter((s) => !s.deletedAt && s.id !== existingSnap?.id && s.date <= date).toArray()).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
      const prev = earlier.at(-1)?.balanceAgorot ?? 0;
      const snap = validate(PensionSnapshot, {
        ...(existingSnap ? { id: existingSnap.id, createdAt: existingSnap.createdAt, updatedAt: ts } : newSystemFields()),
        fundId: employer.pensionFundId,
        date,
        balanceAgorot: prev + deposits,
        depositsEmployeeAgorot: row.pensionEmployeeAgorot,
        depositsEmployerAgorot: row.pensionEmployerAgorot,
        depositsSeveranceAgorot: row.severanceAgorot,
        payslipId: row.id,
      });
      await db.pensionSnapshots.put(snap);
    } else if (existingSnap) {
      await db.pensionSnapshots.update(existingSnap.id, { deletedAt: ts, updatedAt: ts });
    }
    return row;
  });
}

export async function deletePayslip(db: FinanceDB, id: string): Promise<void> {
  const ts = nowIso();
  await db.transaction('rw', [db.payslips, db.transactions, db.pensionSnapshots], async () => {
    await db.payslips.update(id, { deletedAt: ts, updatedAt: ts });
    await db.transactions.filter((t) => t.links?.payslipId === id && !t.deletedAt).modify({ deletedAt: ts, updatedAt: ts });
    await db.pensionSnapshots.filter((s) => s.payslipId === id && !s.deletedAt).modify({ deletedAt: ts, updatedAt: ts });
  });
}

/** Startup job: a payslip's pending income clears when its pay date arrives. */
export async function clearDueSalary(db: FinanceDB, today: string = todayIL()): Promise<number> {
  const due = await db.transactions.where('status').equals('pending').filter((t) => !!t.links?.payslipId && !t.deletedAt && t.date <= today).toArray();
  const ts = nowIso();
  for (const t of due) await db.transactions.update(t.id, { status: 'cleared', updatedAt: ts });
  return due.length;
}
