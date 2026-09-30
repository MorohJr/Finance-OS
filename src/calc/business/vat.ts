import { BP_SCALE, divRoundHalfUp, mulBp } from '../money';

/** Business income VAT (SPEC 11.2). Rates come from TaxSettings; nothing is hard-coded. */

export type AmountMode = 'excl_vat' | 'incl_vat';
export type VatStatus = 'exempt' | 'licensed';

export interface VatBreakdown {
  net: number;
  vat: number;
  total: number;
}

/** Splits a VAT-inclusive total: net = round(total ÷ (1 + rate)), vat = total − net. */
export function splitInclusive(total: number, vatRateBp: number): VatBreakdown {
  const net = divRoundHalfUp(total * BP_SCALE, BP_SCALE + vatRateBp);
  return { net, vat: total - net, total };
}

export function incomeVat(amount: number, mode: AmountMode, status: VatStatus, vatRateBp: number): VatBreakdown {
  if (status === 'exempt') return { net: amount, vat: 0, total: amount };
  if (mode === 'excl_vat') {
    const vat = mulBp(amount, vatRateBp);
    return { net: amount, vat, total: amount + vat };
  }
  return splitInclusive(amount, vatRateBp);
}
