import type { PensionFund, PensionSnapshot } from '../domain/schemas';
import { sumAgorot } from './money';

/** Pension and provident funds (SPEC 6.15): balances come from manual snapshots. */

export function latestSnapshot(snapshots: readonly PensionSnapshot[], fundId: string, asOf?: string): PensionSnapshot | undefined {
  let best: PensionSnapshot | undefined;
  for (const s of snapshots) {
    if (s.deletedAt || s.fundId !== fundId || (asOf && s.date > asOf)) continue;
    if (!best || s.date > best.date || (s.date === best.date && s.createdAt > best.createdAt)) best = s;
  }
  return best;
}

export interface FundView {
  fund: PensionFund;
  balance: number;
  asOf?: string;
  depositsYtd: { employee: number; employer: number; severance: number; self: number; total: number };
}

export function fundViews(funds: readonly PensionFund[], snapshots: readonly PensionSnapshot[], today: string): FundView[] {
  const yearStart = `${today.slice(0, 4)}-01-01`;
  return funds
    .filter((f) => !f.deletedAt)
    .map((fund) => {
      const last = latestSnapshot(snapshots, fund.id, today);
      const ytd = snapshots.filter((s) => !s.deletedAt && s.fundId === fund.id && s.date >= yearStart && s.date <= today);
      const employee = sumAgorot(ytd.map((s) => s.depositsEmployeeAgorot ?? 0));
      const employer = sumAgorot(ytd.map((s) => s.depositsEmployerAgorot ?? 0));
      const severance = sumAgorot(ytd.map((s) => s.depositsSeveranceAgorot ?? 0));
      const self = sumAgorot(ytd.map((s) => s.depositsSelfAgorot ?? 0));
      return { fund, balance: last?.balanceAgorot ?? 0, asOf: last?.date, depositsYtd: { employee, employer, severance, self, total: employee + employer + severance + self } };
    });
}

/** Liquid (e.g. investment provident fund) vs. locked balances, for net worth (10.11). */
export function pensionTotals(funds: readonly PensionFund[], snapshots: readonly PensionSnapshot[], asOf: string): { liquid: number; illiquid: number } {
  let liquid = 0;
  let illiquid = 0;
  for (const f of funds) {
    if (f.deletedAt) continue;
    const b = latestSnapshot(snapshots, f.id, asOf)?.balanceAgorot ?? 0;
    if (f.isLiquid) liquid += b;
    else illiquid += b;
  }
  return { liquid, illiquid };
}
