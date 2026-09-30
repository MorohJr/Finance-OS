import { afterEach, describe, expect, it } from 'vitest';
import { FinanceDB } from '../../db/db';
import { createAccount } from '../../services/accounts';
import { deleteTrade, saveFund, saveSecurity, saveSnapshot, saveTrade, selfDeposit, setPrice } from '../../services/investments';
import { ensureNetWorthSnapshots, netWorthAt } from '../../services/networth';
import { createTransaction } from '../../services/transactions';
import { accountBalance } from '../../calc/balance';
import { summarizeFlows } from '../../calc/cashflow';
import { SETTINGS_ID } from '../../domain/schemas';

const dbs: FinanceDB[] = [];
afterEach(async () => {
  while (dbs.length) await dbs.pop()!.delete();
});

async function setup() {
  const db = new FinanceDB(`s6-${crypto.randomUUID()}`);
  dbs.push(db);
  await db.open();
  const bank = await createAccount(db, { name: 'עו"ש', kind: 'bank', context: 'personal', isVisibleOnDashboard: true }, 1_000_000, '2026-01-01');
  const broker = await createAccount(db, { name: 'מסחר', kind: 'brokerage', context: 'personal', isVisibleOnDashboard: true }, 500_000, '2026-01-01');
  await db.accounts.toCollection().modify({ createdAt: '2026-01-01T00:00:00.000Z' });
  return { db, bank, broker };
}

describe('trades move brokerage cash (6.14)', () => {
  it('buy and dividend create investment_trade transactions; delete removes them; not income', async () => {
    const { db, broker } = await setup();
    const s = await saveSecurity(db, { symbol: 'TA35', name: 'מחקה ת"א 35', exchange: 'TASE', type: 'etf', priceUnit: 'ILA' });
    const buy = await saveTrade(db, { brokerageAccountId: broker.id, securityId: s.id, type: 'buy', date: '2026-02-01', quantity: '100', grossAgorot: 200_000, feeAgorot: 1_000 });
    await saveTrade(db, { brokerageAccountId: broker.id, securityId: s.id, type: 'dividend', date: '2026-03-01', grossAgorot: 4_000, taxWithheldAgorot: 1_000 });
    let txs = await db.transactions.toArray();
    expect(accountBalance(broker.id, txs)).toBe(500_000 - 201_000 + 3_000);
    expect(summarizeFlows(txs, { from: '2026-01-01', to: '2026-12-31' }).income).toBe(0);
    await deleteTrade(db, buy.id);
    txs = await db.transactions.toArray();
    expect(accountBalance(broker.id, txs)).toBe(503_000);
  });
});

describe('pension (6.15)', () => {
  it('self deposit is a transfer out of the bank linked to the fund', async () => {
    const { db, bank } = await setup();
    const f = await saveFund(db, { name: 'קרן פנסיה', productType: 'pension_fund', provider: 'מגדל', source: 'self_employed', isLiquid: false });
    await saveSnapshot(db, { fundId: f.id, date: '2026-06-30', balanceAgorot: 10_000_000 });
    await selfDeposit(db, f.id, bank.id, 100_000, '2026-07-05');
    const txs = await db.transactions.toArray();
    expect(accountBalance(bank.id, txs)).toBe(900_000);
    expect(summarizeFlows(txs, { from: '2026-07-01', to: '2026-07-31' }).expense).toBe(0);
    const nw = await netWorthAt(db, '2026-07-31');
    expect(nw.breakdown.pension).toBe(10_100_000);
    expect(nw.liquidAssets).toBe(nw.assets - 10_100_000);
  });
});

describe('net worth snapshots (6.13)', () => {
  it('an account entered today with an older opening balance counts in past months (regression)', async () => {
    const db = new FinanceDB(`s6r-${crypto.randomUUID()}`);
    dbs.push(db);
    await db.open();
    await createAccount(db, { name: 'עו"ש', kind: 'bank', context: 'personal', isVisibleOnDashboard: true }, 1_842_015, '2026-06-01');
    expect(await ensureNetWorthSnapshots(db, '2026-09-30')).toBe(1);
    expect((await db.netWorthSnapshots.where('month').equals('2026-08').first())?.netWorth).toBe(1_842_015);
    expect((await netWorthAt(db, '2026-05-31')).netWorth).toBe(0);
  });

  it('first run: last month only; later: fills every missing month once', async () => {
    const { db, bank, broker } = await setup();
    const s = await saveSecurity(db, { symbol: 'X', name: 'X', exchange: 'NASDAQ', type: 'stock', priceUnit: 'ILS' });
    await saveTrade(db, { brokerageAccountId: broker.id, securityId: s.id, type: 'buy', date: '2026-02-01', quantity: '10', grossAgorot: 100_000 });
    await setPrice(db, s.id, 12_000, '2026-02-20');
    expect(await ensureNetWorthSnapshots(db, '2026-03-05')).toBe(1);
    const feb = await db.netWorthSnapshots.where('month').equals('2026-02').first();
    // bank 10,000 + broker cash 4,000 + 10 units × ₪120
    expect(feb?.netWorth).toBe(1_000_000 + 400_000 + 120_000);
    expect(await ensureNetWorthSnapshots(db, '2026-03-20')).toBe(0);

    await createTransaction(db, { kind: 'expense', amountAgorot: 50_000, date: '2026-04-10', accountId: bank.id, context: 'personal', status: 'cleared' });
    expect(await ensureNetWorthSnapshots(db, '2026-06-01')).toBe(3); // Mar, Apr, May
    const may = await db.netWorthSnapshots.where('month').equals('2026-05').first();
    expect(may?.netWorth).toBe(1_520_000 - 50_000);
    expect((await db.settings.get(SETTINGS_ID))?.lastNetWorthSnapshotMonth).toBe('2026-05');
  });
});
