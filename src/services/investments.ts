import type { FinanceDB } from '../db/db';
import { FxRate, InvestmentTrade, PensionFund, PensionSnapshot, PricePoint, Security, type InvestmentTrade as TradeT, type PensionFund as FundT, type PensionSnapshot as SnapT, type Security as SecurityT } from '../domain/schemas';
import { tradeCashFlow } from '../calc/investments';
import { nowIso, todayIL } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';
import { createTransaction } from './transactions';

// ---------------------------------------------------------------------------
// Securities, trades, prices (6.14)
// ---------------------------------------------------------------------------

export type SecurityInput = Omit<SecurityT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function saveSecurity(db: FinanceDB, input: SecurityInput, id?: string): Promise<SecurityT> {
  const current = id ? await db.securities.get(id) : undefined;
  const row = validate(Security, { ...(current ? { id: current.id, createdAt: current.createdAt, updatedAt: nowIso() } : newSystemFields()), ...compact(input) });
  await db.securities.put(row);
  return row;
}

export async function deleteSecurity(db: FinanceDB, id: string): Promise<void> {
  const used = await db.investmentTrades.where('securityId').equals(id).filter((t) => !t.deletedAt).count();
  if (used) throw new Error('has_trades');
  const ts = nowIso();
  await db.securities.update(id, { deletedAt: ts, updatedAt: ts });
}

export type TradeInput = Omit<TradeT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** The brokerage cash movement for a trade: an `investment_trade` transaction (6.14). */
async function syncTradeTx(db: FinanceDB, trade: TradeT, securityName: string) {
  const existing = await db.transactions.filter((t) => t.links?.tradeId === trade.id && !t.deletedAt).first();
  const flow = tradeCashFlow(trade);
  const ts = nowIso();
  if (flow === 0 || trade.deletedAt) {
    if (existing) await db.transactions.update(existing.id, { deletedAt: ts, updatedAt: ts });
    return;
  }
  const account = await db.accounts.get(trade.brokerageAccountId);
  const fields = {
    amountAgorot: Math.abs(flow),
    direction: flow > 0 ? ('in' as const) : ('out' as const),
    date: trade.date,
    accountId: trade.brokerageAccountId,
    description: securityName,
  };
  if (existing) await db.transactions.update(existing.id, { ...fields, updatedAt: ts });
  else await createTransaction(db, { kind: 'investment_trade', ...fields, context: account?.context ?? 'personal', status: 'cleared', source: 'system', links: { tradeId: trade.id } });
}

export async function saveTrade(db: FinanceDB, input: TradeInput, id?: string): Promise<TradeT> {
  return db.transaction('rw', [db.investmentTrades, db.transactions, db.accounts, db.securities], async () => {
    const current = id ? await db.investmentTrades.get(id) : undefined;
    const row = validate(InvestmentTrade, { ...(current ? { id: current.id, createdAt: current.createdAt, updatedAt: nowIso() } : newSystemFields()), ...compact(input) });
    await db.investmentTrades.put(row);
    const security = await db.securities.get(row.securityId);
    await syncTradeTx(db, row, security?.symbol ?? '');
    return row;
  });
}

export async function deleteTrade(db: FinanceDB, id: string): Promise<void> {
  await db.transaction('rw', [db.investmentTrades, db.transactions, db.accounts, db.securities], async () => {
    const ts = nowIso();
    await db.investmentTrades.update(id, { deletedAt: ts, updatedAt: ts });
    const row = (await db.investmentTrades.get(id))!;
    await syncTradeTx(db, row, '');
  });
}

/** Manual price update (v1: no external API, SPEC 6.14). One price per security per day. */
export async function setPrice(db: FinanceDB, securityId: string, priceAgorot: number, date: string = todayIL(), source: 'manual' | 'import' = 'manual'): Promise<void> {
  const existing = await db.pricePoints.where('[securityId+date]').equals([securityId, date]).first();
  if (existing) await db.pricePoints.update(existing.id, { priceAgorot, source, updatedAt: nowIso(), deletedAt: undefined });
  else await db.pricePoints.add(validate(PricePoint, { ...newSystemFields(), securityId, date, priceAgorot, source }));
}

export async function setFxRate(db: FinanceDB, usdIls: string, date: string = todayIL()): Promise<void> {
  const existing = await db.fxRates.where('date').equals(date).first();
  if (existing) await db.fxRates.update(existing.id, { usdIls, updatedAt: nowIso() });
  else await db.fxRates.add(validate(FxRate, { ...newSystemFields(), date, usdIls }));
}

// ---------------------------------------------------------------------------
// Pension (6.15)
// ---------------------------------------------------------------------------

export type FundInput = Omit<FundT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function saveFund(db: FinanceDB, input: FundInput, id?: string): Promise<FundT> {
  const current = id ? await db.pensionFunds.get(id) : undefined;
  const row = validate(PensionFund, { ...(current ? { id: current.id, createdAt: current.createdAt, updatedAt: nowIso() } : newSystemFields()), ...compact(input) });
  await db.pensionFunds.put(row);
  return row;
}

export async function deleteFund(db: FinanceDB, id: string): Promise<void> {
  const ts = nowIso();
  await db.pensionFunds.update(id, { deletedAt: ts, updatedAt: ts });
}

export type SnapshotInput = Omit<SnapT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function saveSnapshot(db: FinanceDB, input: SnapshotInput, id?: string): Promise<SnapT> {
  const current = id ? await db.pensionSnapshots.get(id) : undefined;
  const row = validate(PensionSnapshot, { ...(current ? { id: current.id, createdAt: current.createdAt, updatedAt: nowIso() } : newSystemFields()), ...compact(input) });
  await db.pensionSnapshots.put(row);
  return row;
}

export async function deleteSnapshot(db: FinanceDB, id: string): Promise<void> {
  const ts = nowIso();
  await db.pensionSnapshots.update(id, { deletedAt: ts, updatedAt: ts });
}

/**
 * Self deposit (6.15): a transfer out of the bank linked to the fund, and a snapshot line so the
 * fund shows the deposit. The fund's balance still comes from the next statement.
 */
export async function selfDeposit(db: FinanceDB, fundId: string, fromAccountId: string, amountAgorot: number, date: string = todayIL()): Promise<void> {
  const fund = await db.pensionFunds.get(fundId);
  if (!fund) throw new Error('not_found');
  const account = await db.accounts.get(fromAccountId);
  await db.transaction('rw', [db.transactions, db.pensionSnapshots, db.pensionFunds], async () => {
    await createTransaction(db, { kind: 'transfer', amountAgorot, date, accountId: fromAccountId, context: account?.context ?? 'personal', status: 'cleared', source: 'manual', description: fund.name, links: { pensionFundId: fundId } });
    const last = await db.pensionSnapshots.where('fundId').equals(fundId).filter((s) => !s.deletedAt).sortBy('date');
    const prev = last.at(-1);
    await db.pensionSnapshots.add(validate(PensionSnapshot, { ...newSystemFields(), fundId, date, balanceAgorot: (prev?.balanceAgorot ?? 0) + amountAgorot, depositsSelfAgorot: amountAgorot }));
  });
}
