import type { InstallmentPlan, Transaction, WishItem } from '../domain/schemas';
import { monthsBetween } from './dates';
import { BP_SCALE, divRoundHalfUp, sumAgorot } from './money';
import type { InstallmentCharge } from './cards';

/** Wish List (SPEC 10.8). */

export interface WishStatus {
  savedOrPaid: number;
  progressBp: number; // 0..10000
  monthsLeft: number | null;
  monthlyNeeded: number | null;
  label: 'done' | 'behind' | 'on_track' | 'no_goal';
}

/**
 * saving: Σ transfers linked to the item (DECISION 15.2: saving is a transfer, not income).
 * installments: Σ linked expenses; if bought through a card InstallmentPlan, only the charges paid so far.
 */
export function wishStatus(
  item: Pick<WishItem, 'id' | 'priceAgorot' | 'fundingMethod' | 'startMonth' | 'goalMonth' | 'status'>,
  txs: readonly Pick<Transaction, 'id' | 'kind' | 'amountAgorot' | 'links' | 'deletedAt' | 'status'>[],
  plans: readonly Pick<InstallmentPlan, 'transactionId' | 'deletedAt'>[],
  chargesByTx: ReadonlyMap<string, readonly InstallmentCharge[]>,
  today: string,
): WishStatus {
  const linked = txs.filter((t) => t.links?.wishItemId === item.id && !t.deletedAt && t.status === 'cleared');
  const planTx = new Set(plans.filter((p) => !p.deletedAt).map((p) => p.transactionId));
  const parts =
    item.fundingMethod === 'saving'
      ? linked.filter((t) => t.kind === 'transfer').map((t) => t.amountAgorot)
      : linked
          .filter((t) => t.kind === 'expense')
          .map((t) => (planTx.has(t.id) ? sumAgorot((chargesByTx.get(t.id) ?? []).filter((c) => c.chargeDate <= today).map((c) => c.amountAgorot)) : t.amountAgorot));
  const savedOrPaid = sumAgorot(parts);
  const progressBp = Math.min(BP_SCALE, divRoundHalfUp(savedOrPaid * BP_SCALE, item.priceAgorot));
  const currentMonth = today.slice(0, 7);
  const monthsLeft = item.goalMonth ? Math.max(1, monthsBetween(currentMonth, item.goalMonth)) : null;
  const monthlyNeeded = monthsLeft === null ? null : divRoundHalfUp(Math.max(0, item.priceAgorot - savedOrPaid), monthsLeft);

  let label: WishStatus['label'] = 'no_goal';
  if (progressBp >= BP_SCALE || item.status === 'done') label = 'done';
  else if (item.startMonth && item.goalMonth) {
    const total = Math.max(1, monthsBetween(item.startMonth, item.goalMonth));
    const elapsed = Math.min(total, Math.max(0, monthsBetween(item.startMonth, currentMonth)));
    const timeBp = divRoundHalfUp(elapsed * BP_SCALE, total);
    label = progressBp < timeBp ? 'behind' : 'on_track';
  } else if (item.goalMonth) label = 'on_track';
  return { savedOrPaid, progressBp, monthsLeft, monthlyNeeded, label };
}
