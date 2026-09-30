import { afterEach, describe, expect, it } from 'vitest';
import { FinanceDB } from '../../db/db';
import { createAccount } from '../../services/accounts';
import { saveFund, saveSnapshot } from '../../services/investments';
import { clearDueSalary, deletePayslip, saveEmployer, savePayslip } from '../../services/salary';
import { accountBalance } from '../../calc/balance';
import { summarizeFlows } from '../../calc/cashflow';
import { latestSnapshot } from '../../calc/pension';

const dbs: FinanceDB[] = [];
afterEach(async () => {
  while (dbs.length) await dbs.pop()!.delete();
});

describe('payslip (stage 7 acceptance: income by net and a pension deposit)', () => {
  it('creates the income and the fund delta; future pay date is pending until it arrives; delete undoes both', async () => {
    const db = new FinanceDB(`sal-${crypto.randomUUID()}`);
    dbs.push(db);
    await db.open();
    const bank = await createAccount(db, { name: 'עו"ש', kind: 'bank', context: 'personal', isVisibleOnDashboard: true });
    const fund = await saveFund(db, { name: 'קרן פנסיה', productType: 'pension_fund', provider: 'הראל', source: 'employer', isLiquid: false });
    await saveSnapshot(db, { fundId: fund.id, date: '2026-06-30', balanceAgorot: 20_000_000 });
    const employer = await saveEmployer(db, { name: 'חברת הייטק', payDay: 9, depositAccountId: bank.id, pensionFundId: fund.id });

    const slip = await savePayslip(
      db,
      { employerId: employer.id, month: '2026-09', grossAgorot: 1_500_000, incomeTaxAgorot: 150_000, nationalInsuranceAgorot: 60_000, healthTaxAgorot: 40_000, pensionEmployeeAgorot: 90_000, pensionEmployerAgorot: 97_500, severanceAgorot: 125_000, netAgorot: 1_160_000 },
      undefined,
      '2026-09-30',
    );
    let txs = await db.transactions.toArray();
    const income = txs.find((t) => t.links?.payslipId === slip.id)!;
    expect(income).toMatchObject({ kind: 'income', amountAgorot: 1_160_000, date: '2026-10-09', status: 'pending', accountId: bank.id });
    expect(accountBalance(bank.id, txs)).toBe(0);

    const snap = latestSnapshot(await db.pensionSnapshots.toArray(), fund.id)!;
    expect(snap).toMatchObject({ date: '2026-10-09', balanceAgorot: 20_000_000 + 90_000 + 97_500 + 125_000, payslipId: slip.id });

    expect(await clearDueSalary(db, '2026-10-08')).toBe(0);
    expect(await clearDueSalary(db, '2026-10-09')).toBe(1);
    txs = await db.transactions.toArray();
    expect(accountBalance(bank.id, txs)).toBe(1_160_000);
    expect(summarizeFlows(txs, { from: '2026-10-01', to: '2026-10-31' }).income).toBe(1_160_000);

    // Editing the payslip updates the same transaction and snapshot.
    await savePayslip(db, { employerId: employer.id, month: '2026-09', grossAgorot: 1_500_000, incomeTaxAgorot: 150_000, nationalInsuranceAgorot: 60_000, healthTaxAgorot: 40_000, pensionEmployeeAgorot: 90_000, netAgorot: 1_170_000 }, slip.id, '2026-10-10');
    txs = await db.transactions.toArray();
    expect(txs.filter((t) => t.links?.payslipId === slip.id && !t.deletedAt)).toHaveLength(1);
    expect(accountBalance(bank.id, txs)).toBe(1_170_000);
    expect(latestSnapshot(await db.pensionSnapshots.toArray(), fund.id)?.balanceAgorot).toBe(20_090_000);

    await deletePayslip(db, slip.id);
    expect(accountBalance(bank.id, await db.transactions.toArray())).toBe(0);
    expect(latestSnapshot(await db.pensionSnapshots.toArray(), fund.id)?.balanceAgorot).toBe(20_000_000);
  });
});
