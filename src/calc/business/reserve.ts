import { BP_SCALE, divRoundHalfUp, mulBp } from '../money';
import type { VatBreakdown } from './vat';

/**
 * "Set aside" (SPEC 11.2), from the user's own rates (iron rule 4):
 *   base = net (net_income) or net × profitRatio (profit_ratio)
 *   incomeTaxReserve = round(base × incomeTaxRate), niReserve = round(base × niRate), vatReserve = vat
 */

export type ReserveBasis = 'net_income' | 'profit_ratio';

export interface ReserveRates {
  incomeTaxRateBp: number;
  nationalInsuranceRateBp: number;
  reserveBasis: ReserveBasis;
}

export interface ReserveBreakdown {
  base: number;
  profitRatioBp: number;
  incomeTaxReserve: number;
  niReserve: number;
  vatReserve: number;
  setAside: number;
  leftForYou: number;
}

/** profitYTD ÷ revenueYTD, clamped to 0..1 (bp); 1 when there's no revenue yet. */
export function profitRatioBp(profitYtd: number, revenueYtd: number): number {
  if (revenueYtd <= 0) return BP_SCALE;
  return Math.min(BP_SCALE, Math.max(0, divRoundHalfUp(profitYtd * BP_SCALE, revenueYtd)));
}

/**
 * The profit ratio is kept in bp for display, but the base is computed from the exact fraction
 * (rounding only at the end, iron rule 1).
 */
export function setAside(v: VatBreakdown, rates: ReserveRates, ytd: { profit: number; revenue: number } = { profit: 0, revenue: 0 }): ReserveBreakdown {
  const ratioBp = profitRatioBp(ytd.profit, ytd.revenue);
  const exactRatio = rates.reserveBasis === 'profit_ratio' && ytd.revenue > 0;
  const clampedProfit = Math.min(ytd.revenue, Math.max(0, ytd.profit));
  const base = rates.reserveBasis === 'net_income' ? v.net : exactRatio ? divRoundHalfUp(v.net * clampedProfit, ytd.revenue) : v.net;
  const incomeTaxReserve = mulBp(base, rates.incomeTaxRateBp);
  const niReserve = mulBp(base, rates.nationalInsuranceRateBp);
  const total = v.vat + incomeTaxReserve + niReserve;
  return { base, profitRatioBp: rates.reserveBasis === 'profit_ratio' ? ratioBp : BP_SCALE, incomeTaxReserve, niReserve, vatReserve: v.vat, setAside: total, leftForYou: v.total - total };
}

/** Same, with an explicit ratio in bp (used by the golden example and the "what if" view). */
export function setAsideWithRatio(v: VatBreakdown, rates: ReserveRates, ratioBp: number): ReserveBreakdown {
  const base = rates.reserveBasis === 'net_income' ? v.net : mulBp(v.net, Math.min(BP_SCALE, Math.max(0, ratioBp)));
  const incomeTaxReserve = mulBp(base, rates.incomeTaxRateBp);
  const niReserve = mulBp(base, rates.nationalInsuranceRateBp);
  const total = v.vat + incomeTaxReserve + niReserve;
  return { base, profitRatioBp: ratioBp, incomeTaxReserve, niReserve, vatReserve: v.vat, setAside: total, leftForYou: v.total - total };
}
