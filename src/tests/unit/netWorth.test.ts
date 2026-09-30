import { describe, expect, it } from 'vitest';
import { computeNetWorth } from '../../calc/netWorth';

describe('net worth breakdown', () => {
  it('separates money in accounts, liquid assets and locked pension', () => {
    const nw = computeNetWorth({
      accountBalances: [1_000_000, 500_000, -200_000],
      securitiesMarketValue: 300_000,
      pensionLiquid: 100_000,
      pensionIlliquid: 2_000_000,
      lendingRemaining: 50_000,
      cardOpenStatements: 40_000,
      loansRemainingPrincipal: 400_000,
    });
    expect(nw.cashInAccounts).toBe(1_300_000);
    expect(nw.pensionIlliquid).toBe(2_000_000);
    expect(nw.assets).toBe(1_500_000 + 300_000 + 2_100_000 + 50_000);
    expect(nw.liabilities).toBe(200_000 + 40_000 + 400_000);
    expect(nw.netWorth).toBe(nw.assets - nw.liabilities);
    expect(nw.netWorthExcludingPension).toBe(nw.netWorth - 2_000_000);
    expect(nw.pensionLiquid).toBe(100_000);
    // Liquid = accounts + securities + liquid provident; not locked pension, not money lent out.
    expect(nw.liquidAssets).toBe(1_500_000 + 300_000 + 100_000);
  });
});
