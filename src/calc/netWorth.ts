import { sumAgorot } from './money';

/**
 * Net worth (SPEC 10.11). Every input is already computed by its own module; this only combines.
 * Modules not built yet pass nothing and count as 0.
 */
export interface NetWorthInput {
  accountBalances: readonly number[];
  securitiesMarketValue?: number;
  pensionLiquid?: number;
  pensionIlliquid?: number;
  lendingRemaining?: number;
  cardOpenStatements?: number;
  cardFutureInstallments?: number;
  loansRemainingPrincipal?: number;
  checksIssuedPending?: number;
}

export interface NetWorth {
  assets: number;
  liabilities: number;
  netWorth: number;
  liquidAssets: number;
  breakdown: {
    positiveAccounts: number;
    negativeAccounts: number;
    securities: number;
    pension: number;
    lending: number;
    cards: number;
    loans: number;
    checks: number;
  };
}

export function computeNetWorth(i: NetWorthInput): NetWorth {
  const positiveAccounts = sumAgorot(i.accountBalances.filter((b) => b > 0));
  const negativeAccounts = -sumAgorot(i.accountBalances.filter((b) => b < 0));
  const securities = i.securitiesMarketValue ?? 0;
  const pensionIlliquid = i.pensionIlliquid ?? 0;
  const pension = (i.pensionLiquid ?? 0) + pensionIlliquid;
  const lending = i.lendingRemaining ?? 0;
  const cards = (i.cardOpenStatements ?? 0) + (i.cardFutureInstallments ?? 0);
  const loans = i.loansRemainingPrincipal ?? 0;
  const checks = i.checksIssuedPending ?? 0;

  const assets = positiveAccounts + securities + pension + lending;
  const liabilities = negativeAccounts + cards + loans + checks;
  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
    liquidAssets: assets - pensionIlliquid - lending,
    breakdown: { positiveAccounts, negativeAccounts, securities, pension, lending, cards, loans, checks },
  };
}
