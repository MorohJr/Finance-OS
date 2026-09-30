import { afterEach, describe, expect, it } from 'vitest';
import { FinanceDB } from '../../db/db';
import { createAccount } from '../../services/accounts';
import { createCheck, createLending, createLoan, recordLoanPayment, recordRepayment, setCheckStatus } from '../../services/debts';
import { addSaving, createWish } from '../../services/wish';
import { accountBalance } from '../../calc/balance';
import { summarizeFlows } from '../../calc/cashflow';
import { lendingStatus, loanInterestByTx, loanStatus } from '../../calc/loans';
import { wishStatus } from '../../calc/wish';

const dbs: FinanceDB[] = [];
afterEach(async () => {
  while (dbs.length) await dbs.pop()!.delete();
});

async function setup() {
  const db = new FinanceDB(`d-${crypto.randomUUID()}`);
  dbs.push(db);
  await db.open();
  const bank = await createAccount(db, { name: 'עו"ש', kind: 'bank', context: 'personal', isVisibleOnDashboard: true }, 1_000_000, '2026-01-01');
  const savings = await createAccount(db, { name: 'חיסכון', kind: 'savings', context: 'personal', isVisibleOnDashboard: true });
  return { db, bank, savings };
}
const all = (db: FinanceDB) => db.transactions.toArray();

describe('loans (stage 5)', () => {
  it('disbursement minus fees, payments split: only interest is an expense', async () => {
    const { db, bank } = await setup();
    const loan = await createLoan(db, { name: 'הלוואה לרכב', lenderType: 'bank', principalAgorot: 5_000_000, rateType: 'annual', ratePct: 600, termMonths: 36, amortization: 'spitzer', startDate: '2026-10-01', firstPaymentDate: '2026-11-10', feesAgorot: 30_000, accountId: bank.id, receivedToAccountId: bank.id });
    expect(accountBalance(bank.id, await all(db))).toBe(1_000_000 + 5_000_000 - 30_000);
    const p = await recordLoanPayment(db, loan.id);
    expect(p).toMatchObject({ amountAgorot: 152_110, date: '2026-11-10', kind: 'loan_payment' });
    const txs = await all(db);
    const st = loanStatus(loan, txs, '2026-11-11');
    expect(st.paidInterest).toBe(25_000);
    const interest = loanInterestByTx([st]);
    const flows = summarizeFlows(txs, { from: '2026-11-01', to: '2026-11-30', interestPart: (t) => interest.get(t.id) ?? 0 });
    expect(flows.expense).toBe(25_000);
    expect(flows.income).toBe(0); // disbursement is not income
  });
});

describe('lending (stage 5)', () => {
  it('lending_out reduces the account; repayment interest is income', async () => {
    const { db, bank } = await setup();
    const l = await createLending(db, { borrowerName: 'דני', principalAgorot: 100_000, ratePct: 1000, date: '2026-09-01', fromAccountId: bank.id });
    expect(accountBalance(bank.id, await all(db))).toBe(900_000);
    await recordRepayment(db, l.id, 110_000, bank.id, '2026-10-01');
    const txs = await all(db);
    const st = lendingStatus(l, txs);
    expect(st).toMatchObject({ totalDue: 110_000, remaining: 0, isPaidOff: true });
    const flows = summarizeFlows(txs, { from: '2026-10-01', to: '2026-10-31', interestPart: (t) => st.interestByTx.get(t.id) ?? 0 });
    expect(flows.income).toBe(10_000);
  });
});

describe('checks (6.12)', () => {
  it('pending until cleared; bounced cancels; enters as pending on the due date', async () => {
    const { db, bank } = await setup();
    const c = await createCheck(db, { direction: 'issued', number: '1001', amountAgorot: 250_000, issueDate: '2026-09-01', dueDate: '2026-11-01', counterparty: 'בעל הבית', accountId: bank.id, status: 'pending', context: 'personal' });
    let t = (await all(db)).find((x) => x.links?.checkId === c.id)!;
    expect(t).toMatchObject({ status: 'pending', date: '2026-11-01', kind: 'expense' });
    expect(accountBalance(bank.id, await all(db))).toBe(1_000_000);
    await setCheckStatus(db, c.id, 'cleared');
    t = (await db.transactions.get(t.id))!;
    expect(t.status).toBe('cleared');
    expect(accountBalance(bank.id, await all(db))).toBe(750_000);
    await setCheckStatus(db, c.id, 'bounced');
    expect((await db.transactions.get(t.id))?.deletedAt).toBeDefined();
    expect(accountBalance(bank.id, await all(db))).toBe(1_000_000);
  });
});

describe('wish list saving (15.2)', () => {
  it('saving is a transfer to the savings account, not income', async () => {
    const { db, bank, savings } = await setup();
    const w = await createWish(db, { name: 'אופניים', priceAgorot: 400_000, priority: 'high', status: 'active', fundingMethod: 'saving', savingsAccountId: savings.id, goalMonth: '2027-01' });
    await addSaving(db, w.id, bank.id, 100_000, '2026-09-15');
    const txs = await all(db);
    expect(accountBalance(savings.id, txs)).toBe(100_000);
    expect(summarizeFlows(txs, { from: '2026-09-01', to: '2026-09-30' }).income).toBe(0);
    expect(wishStatus(w, txs, [], new Map(), '2026-09-30')).toMatchObject({ savedOrPaid: 100_000, progressBp: 2_500, monthsLeft: 4, monthlyNeeded: 75_000 });
  });
});
