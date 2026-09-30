import type { FinanceDB } from '../db/db';
import { NetWorthSnapshot, SETTINGS_ID, type NetWorthSnapshot as SnapshotT } from '../domain/schemas';
import { accountBalance } from '../calc/balance';
import { computeStatements } from '../calc/cards';
import { computeNetWorth, type NetWorth } from '../calc/netWorth';
import { lendingStatus, loanStatus } from '../calc/loans';
import { portfolio } from '../calc/investments';
import { pensionTotals } from '../calc/pension';
import { monthRange, nextMonth, previousMonth } from '../calc/cashflow';
import { currentMonthIL, todayIL } from '../calc/dates';
import { sumAgorot } from '../calc/money';
import { newSystemFields, validate } from './entity';
import { taxSettingsAt } from './business';
import { TAX_DEFAULTS_2026 } from '../db/seed.data';

/**
 * Net worth as of a date (SPEC 10.11), computed from everything in the DB.
 * For past dates: card statements count as paid on their charge date, checks are pending until
 * their due date, prices and pension balances are the latest known on that date.
 */
export async function netWorthAt(db: FinanceDB, asOf: string): Promise<NetWorth> {
  const [accounts, txs, cards, plans, statements, loans, lendings, checks, securities, trades, prices, fx, funds, pensionSnaps, settings] = await Promise.all([
    db.accounts.filter((a) => !a.deletedAt && a.createdAt.slice(0, 10) <= asOf).toArray(),
    db.transactions.filter((t) => !t.deletedAt).toArray(),
    db.cards.filter((c) => !c.deletedAt && c.kind === 'credit').toArray(),
    db.installmentPlans.filter((p) => !p.deletedAt).toArray(),
    db.cardStatements.filter((s) => !s.deletedAt).toArray(),
    db.loans.filter((l) => !l.deletedAt && l.startDate <= asOf).toArray(),
    db.lendings.filter((l) => !l.deletedAt && l.date <= asOf).toArray(),
    db.checks.filter((c) => !c.deletedAt).toArray(),
    db.securities.toArray(),
    db.investmentTrades.filter((t) => !t.deletedAt).toArray(),
    db.pricePoints.toArray(),
    db.fxRates.toArray(),
    db.pensionFunds.toArray(),
    db.pensionSnapshots.toArray(),
    db.settings.get(SETTINGS_ID),
  ]);
  const tax = await taxSettingsAt(db, asOf);
  const until = txs.filter((t) => t.date <= asOf);

  let cardOpen = 0;
  let cardFuture = 0;
  const today = todayIL();
  for (const card of cards) {
    const mine = statements.filter((s) => s.cardId === card.id);
    const byId = new Map(mine.map((s) => [s.id, s]));
    const paidToday = new Set(mine.filter((s) => s.status === 'paid').map((s) => s.chargeDate));
    const computed = computeStatements(card, until, plans.filter((p) => p.cardId === card.id), (sid) => byId.get(sid)?.chargeDate);
    // Looking back, a statement counts as paid on its charge date; for today, the stored status decides.
    const paid = (chargeDate: string) => (asOf < today ? chargeDate <= asOf : paidToday.has(chargeDate));
    for (const s of computed) {
      if (paid(s.chargeDate)) continue;
      if (s.periodStart <= asOf) cardOpen += Math.max(0, s.total);
      else cardFuture += sumAgorot(s.items.filter((i) => i.kind === 'installment').map((i) => i.amountAgorot));
    }
  }

  const pf = portfolio(securities, trades, prices, fx, { method: settings?.costBasisMethod ?? 'moving_average', today: asOf, capitalGainsRateBp: tax?.capitalGainsRateBp ?? TAX_DEFAULTS_2026.capitalGainsRateBp, asOf });
  const pension = pensionTotals(funds, pensionSnaps, asOf);

  return computeNetWorth({
    accountBalances: accounts.map((a) => accountBalance(a.id, until)),
    securitiesMarketValue: pf.totalValue,
    pensionLiquid: pension.liquid,
    pensionIlliquid: pension.illiquid,
    lendingRemaining: sumAgorot(lendings.map((l) => lendingStatus(l, until).remaining)),
    cardOpenStatements: cardOpen,
    cardFutureInstallments: cardFuture,
    loansRemainingPrincipal: sumAgorot(loans.map((l) => Math.max(0, loanStatus(l, until, asOf).remainingPrincipal))),
    checksIssuedPending: sumAgorot(
      checks.filter((c) => c.direction === 'issued' && c.issueDate <= asOf && (asOf < today ? c.dueDate > asOf && c.status !== 'cancelled' : c.status === 'pending' || c.status === 'deposited')).map((c) => c.amountAgorot),
    ),
  });
}

/**
 * SPEC 6.13: at the first open of a month, a snapshot for the previous month; months the app
 * wasn't opened are filled too. The very first run creates only last month's snapshot.
 */
export async function ensureNetWorthSnapshots(db: FinanceDB, today: string = todayIL()): Promise<number> {
  const settings = await db.settings.get(SETTINGS_ID);
  if (!settings) return 0;
  const hasData = (await db.accounts.count()) > 0;
  if (!hasData) return 0;
  const lastMonth = previousMonth(currentMonthIL(new Date(`${today}T12:00:00Z`)));
  const start = settings.lastNetWorthSnapshotMonth ? nextMonth(settings.lastNetWorthSnapshotMonth) : lastMonth;
  let created = 0;
  for (let m = start; m <= lastMonth; m = nextMonth(m)) {
    const exists = await db.netWorthSnapshots.where('month').equals(m).first();
    if (!exists) {
      const nw = await netWorthAt(db, monthRange(m).to);
      const row: SnapshotT = validate(NetWorthSnapshot, { ...newSystemFields(), month: m, assets: nw.assets, liabilities: nw.liabilities, netWorth: nw.netWorth, liquidAssets: nw.liquidAssets, breakdown: nw.breakdown });
      await db.netWorthSnapshots.add(row);
      created++;
    }
    await db.settings.update(SETTINGS_ID, { lastNetWorthSnapshotMonth: m });
  }
  return created;
}
