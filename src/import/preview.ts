import type { Card, CategoryRule, InstallmentPlan, Payee, Transaction } from '../domain/schemas';
import { cycleForDate, installmentSchedule, type ComputedStatement } from '../calc/cards';
import { suggestCategory } from '../calc/categoryRules';
import { addMonths, daysBetween, withDay } from '../calc/dates';
import { normalizeDescription, type ParsedRow } from './parse';

/** Import preview (SPEC 9.1 step 3): what each row will become, and what's flagged. */

export type ImportTarget = { kind: 'bank'; accountId: string } | { kind: 'card'; card: Card };

export interface PreviewRow {
  row: ParsedRow;
  hash: string;
  txKind: 'income' | 'expense' | 'refund';
  /** create: a normal transaction. new_plan: first sight of an installment purchase. existing_plan: a charge of a plan we already have. */
  action: 'create' | 'new_plan' | 'existing_plan';
  include: boolean;
  categoryId?: string;
  payeeId?: string;
  context?: 'personal' | 'business';
  flags: {
    duplicate?: 'import' | 'manual';
    cardPayment?: string; // card name
    installment?: { number: number; count: number };
  };
  /** For new_plan: the reconstructed purchase. */
  plan?: { purchaseAmountAgorot: number; firstChargeDate: string; count: number; estimated: boolean };
  chargeDate?: string;
}

export interface PreviewContext {
  target: ImportTarget;
  hashes: string[];
  existingHashes: ReadonlySet<string>;
  /** Non-deleted transactions on the target (for manual duplicates and installment matching). */
  targetTxs: readonly Transaction[];
  plans: readonly InstallmentPlan[];
  /** Statements of app-tracked credit cards billed to the bank account (bank imports). */
  billedStatements: readonly (ComputedStatement & { cardName: string })[];
  rules: readonly CategoryRule[];
  payees: readonly Payee[];
}

export interface PreviewResult {
  rows: PreviewRow[];
  /** SPEC 10.2: import charge dates consistently different from the computed cycle → suggest a cutoff day. */
  cutoffSuggestion?: { mismatched: number; total: number };
}

export function buildPreview(parsed: readonly ParsedRow[], ctx: PreviewContext): PreviewResult {
  const claimedManual = new Set<string>();
  const manual = ctx.targetTxs.filter((t) => !t.importHash && !t.deletedAt && t.source !== 'system');
  const txById = new Map(ctx.targetTxs.map((t) => [t.id, t]));
  const card = ctx.target.kind === 'card' ? ctx.target.card : undefined;
  let mismatched = 0;
  let withCharge = 0;

  const rows = parsed.map((row, i): PreviewRow => {
    const hash = ctx.hashes[i]!;
    const txKind = ctx.target.kind === 'card' ? (row.flow === 'out' ? 'expense' : 'refund') : row.flow === 'out' ? 'expense' : 'income';
    const suggestion = suggestCategory(row.description, ctx.rules, ctx.payees);
    const base: PreviewRow = {
      row,
      hash,
      txKind,
      action: 'create',
      include: true,
      categoryId: suggestion?.categoryId,
      payeeId: suggestion?.payeeId,
      context: suggestion?.context,
      flags: {},
      chargeDate: row.chargeDate,
    };

    if (card && row.chargeDate) {
      withCharge++;
      if (cycleForDate(row.date, card).chargeDate !== row.chargeDate && !row.installment) mismatched++;
    }

    if (ctx.existingHashes.has(hash)) return { ...base, include: false, flags: { duplicate: 'import' } };

    // Installments in card files (SPEC 9.3).
    if (card && row.installment && row.flow === 'out') {
      const desc = normalizeDescription(row.description);
      const chargeDate = row.chargeDate ?? cycleForDate(row.date, card).chargeDate;
      const match = ctx.plans.find((p) => {
        if (p.cardId !== card.id || p.deletedAt || p.count !== row.installment!.count) return false;
        const t = txById.get(p.transactionId);
        if (!t || normalizeDescription(t.description ?? '') !== desc) return false;
        const charge = installmentSchedule(p, card)[row.installment!.number - 1];
        return !!charge && Math.abs(charge.amountAgorot - row.amountAgorot) <= 1;
      });
      if (match) return { ...base, action: 'existing_plan', include: false, flags: { installment: row.installment } };
      const estimated = row.originalAmountAgorot === undefined;
      return {
        ...base,
        action: 'new_plan',
        flags: { installment: row.installment },
        chargeDate,
        plan: {
          // DECISION: without an original amount column, the purchase is estimated as charge × count.
          purchaseAmountAgorot: row.originalAmountAgorot ?? row.amountAgorot * row.installment.count,
          // "firstChargeDate מחושב אחורה" from this charge's number.
          firstChargeDate: withDay(addMonths(chargeDate, -(row.installment.number - 1)), card.chargeDay),
          count: row.installment.count,
          estimated,
        },
      };
    }

    // A monthly card charge in a bank file, for a card the app already tracks: the app creates that
    // card_payment itself, so importing it would count the money twice.
    if (ctx.target.kind === 'bank' && row.flow === 'out') {
      const st = ctx.billedStatements.find((s) => s.total === row.amountAgorot && Math.abs(daysBetween(s.chargeDate, row.date)) <= 3);
      if (st) return { ...base, include: false, flags: { cardPayment: st.cardName } };
    }

    // Probable duplicate of a manual entry: same direction and amount, within 2 days.
    const sign = row.flow === 'out' ? -1 : 1;
    const dup = manual.find((t) => {
      if (claimedManual.has(t.id)) return false;
      const tSign = t.kind === 'income' || t.kind === 'refund' ? 1 : t.kind === 'expense' ? -1 : 0;
      return tSign === sign && t.amountAgorot === row.amountAgorot && Math.abs(daysBetween(t.date, row.date)) <= 2;
    });
    if (dup) {
      claimedManual.add(dup.id);
      return { ...base, include: false, flags: { duplicate: 'manual' } };
    }
    return base;
  });

  return {
    rows,
    cutoffSuggestion: withCharge >= 3 && mismatched / withCharge > 0.5 ? { mismatched, total: withCharge } : undefined,
  };
}
