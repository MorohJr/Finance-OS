import { BP_SCALE, divRoundHalfUp, sumAgorot } from '../money';

/**
 * Mandatory pension for the self-employed (SPEC 11.6):
 *   half = avgWage / 2
 *   obligation = min(p, half) × low + max(0, min(p, avgWage) − half) × high,  p = max(0, profitYTD) ÷ months
 * Everything is scaled by 2 × months so that p and half stay whole numbers; one rounding at the end.
 */
export function pensionObligationMonthly(profitYtd: number, months: number, avgWage: number, lowBp: number, highBp: number): number {
  const m = Math.max(1, months);
  const p2m = 2 * Math.max(0, profitYtd); // p × 2m
  const halfTimes2m = avgWage * m; // half × 2m
  const firstTier = Math.min(p2m, halfTimes2m) * lowBp;
  const secondTier = Math.max(0, Math.min(p2m, 2 * halfTimes2m) - halfTimes2m) * highBp;
  return divRoundHalfUp(firstTier + secondTier, 2 * m * BP_SCALE);
}

export interface PensionObligation {
  profitMonthly: number;
  monthly: number;
  ytdObligation: number;
  ytdDeposits: number;
  gap: number;
}

export function pensionObligation(profitYtd: number, monthsElapsed: number, avgWage: number, lowBp: number, highBp: number, depositsYtd: number): PensionObligation {
  const months = Math.max(1, monthsElapsed);
  const monthly = pensionObligationMonthly(profitYtd, months, avgWage, lowBp, highBp);
  const ytdObligation = monthly * months;
  return { profitMonthly: divRoundHalfUp(Math.max(0, profitYtd), months), monthly, ytdObligation, ytdDeposits: depositsYtd, gap: ytdObligation - depositsYtd };
}

/** Exempt-dealer ceiling tracking (SPEC 11.7). */
export interface PaturStatus {
  turnoverYtd: number;
  pctOfCeilingBp: number;
  projected: number;
  alerts: ('near' | 'projected_over' | 'over')[];
}

export const PATUR_NEAR_BP = 8000;

export function paturStatus(incomeTotals: readonly number[], ceiling: number, monthsElapsed: number): PaturStatus {
  const turnoverYtd = sumAgorot(incomeTotals);
  const pctOfCeilingBp = ceiling > 0 ? divRoundHalfUp(turnoverYtd * BP_SCALE, ceiling) : 0;
  const projected = divRoundHalfUp(turnoverYtd * 12, Math.max(1, monthsElapsed));
  const alerts: PaturStatus['alerts'] = [];
  if (pctOfCeilingBp >= BP_SCALE) alerts.push('over');
  else if (pctOfCeilingBp >= PATUR_NEAR_BP) alerts.push('near');
  if (projected > ceiling && pctOfCeilingBp < BP_SCALE) alerts.push('projected_over');
  return { turnoverYtd, pctOfCeilingBp, projected, alerts };
}
