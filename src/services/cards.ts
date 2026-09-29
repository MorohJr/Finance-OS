import type { FinanceDB } from '../db/db';
import { Card, InstallmentPlan, type Card as CardT, type CardStatement as StatementT, type InstallmentPlan as PlanT, type Transaction as Tx } from '../domain/schemas';
import { computeStatements, cycleForDate, dueForPayment, statementStatus, type ComputedStatement } from '../calc/cards';
import { nowIso, todayIL } from '../calc/dates';
import { compact, newSystemFields, validate } from './entity';
import { createTransaction, updateTransaction, type TransactionInput } from './transactions';

export type CardInput = Omit<CardT, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'status'> & { status?: CardT['status'] };

export async function createCard(db: FinanceDB, input: CardInput): Promise<CardT> {
  const row = validate(Card, { ...newSystemFields(), status: 'active', ...compact(input) });
  await db.cards.add(row);
  return row;
}

export async function updateCard(db: FinanceDB, id: string, input: CardInput): Promise<CardT> {
  const current = await db.cards.get(id);
  if (!current) throw new Error('not_found');
  const row = validate(Card, { id, createdAt: current.createdAt, updatedAt: nowIso(), status: current.status, ...compact(input) });
  await db.cards.put(row);
  return row;
}

export async function setCardStatus(db: FinanceDB, id: string, status: CardT['status']): Promise<void> {
  await db.cards.update(id, { status, updatedAt: nowIso() });
}

export async function deleteCard(db: FinanceDB, id: string): Promise<void> {
  const used = await db.transactions.where('cardId').equals(id).filter((t) => !t.deletedAt).count();
  if (used) throw new Error('has_transactions');
  const ts = nowIso();
  await db.cards.update(id, { deletedAt: ts, updatedAt: ts });
}

// ---------------------------------------------------------------------------
// Purchases (with optional installments)
// ---------------------------------------------------------------------------

export interface InstallmentInput {
  count: number;
  kind: PlanT['kind'];
  interestTotalAgorot?: number;
  budgetRecognition: PlanT['budgetRecognition'];
  firstChargeDate?: string;
}

/**
 * Prepares a card transaction: a debit card charges its billing account immediately (10.2),
 * a credit card leaves the bank untouched until the statement is charged.
 */
async function withCardAccount(db: FinanceDB, input: TransactionInput): Promise<TransactionInput> {
  if (!input.cardId) return input;
  const card = await db.cards.get(input.cardId);
  if (!card) throw new Error('card_not_found');
  return { ...input, accountId: card.kind === 'debit' ? card.billingAccountId : undefined, paymentMethod: input.paymentMethod ?? 'card' };
}

function planRow(tx: Tx, card: CardT, inst: InstallmentInput, existing?: PlanT): PlanT {
  return validate(InstallmentPlan, {
    ...(existing ? { id: existing.id, createdAt: existing.createdAt, updatedAt: nowIso() } : newSystemFields()),
    transactionId: tx.id,
    cardId: card.id,
    // For credit ("קרדיט") the purchase amount already includes the interest (10.3); interest is shown separately.
    totalAgorot: tx.amountAgorot,
    count: inst.count,
    kind: inst.kind,
    interestTotalAgorot: inst.kind === 'credit' ? inst.interestTotalAgorot : undefined,
    firstChargeDate: inst.firstChargeDate ?? cycleForDate(tx.date, card).chargeDate,
    budgetRecognition: inst.budgetRecognition,
  });
}

/** Creates or updates a transaction, and its installment plan when paid in installments by credit card. */
export async function saveTransactionWithInstallments(db: FinanceDB, id: string | undefined, rawInput: TransactionInput, inst?: InstallmentInput): Promise<Tx> {
  const input = await withCardAccount(db, rawInput);
  return db.transaction('rw', [db.transactions, db.installmentPlans, db.cards, db.cardStatements], async () => {
    const existingPlan = id ? await db.installmentPlans.where('transactionId').equals(id).filter((p) => !p.deletedAt).first() : undefined;
    const card = input.cardId ? await db.cards.get(input.cardId) : undefined;
    const usePlan = !!inst && inst.count >= 2 && card?.kind === 'credit' && input.kind === 'expense';
    const tx = id
      ? await updateTransaction(db, id, { ...input, links: { ...(await db.transactions.get(id))?.links, installmentPlanId: usePlan ? (existingPlan?.id ?? undefined) : undefined } })
      : await createTransaction(db, input);

    if (usePlan) {
      const plan = planRow(tx, card!, inst!, existingPlan);
      await db.installmentPlans.put(plan);
      if (tx.links?.installmentPlanId !== plan.id) {
        await db.transactions.update(tx.id, { links: { ...tx.links, installmentPlanId: plan.id } });
      }
    } else if (existingPlan) {
      const ts = nowIso();
      await db.installmentPlans.update(existingPlan.id, { deletedAt: ts, updatedAt: ts });
    }
    return (await db.transactions.get(tx.id))!;
  });
}

/** Soft-deleting a purchase also removes its installment plan. */
export async function deletePlanForTransaction(db: FinanceDB, transactionId: string): Promise<void> {
  const ts = nowIso();
  await db.installmentPlans.where('transactionId').equals(transactionId).modify({ deletedAt: ts, updatedAt: ts });
}

// ---------------------------------------------------------------------------
// Statements: sync and automatic closing (10.2)
// ---------------------------------------------------------------------------

export interface CardData {
  card: CardT;
  statements: ComputedStatement[];
  stored: Map<string, StatementT>; // by chargeDate
  paidChargeDates: Set<string>;
  plans: PlanT[];
}

export async function loadCardData(db: FinanceDB, card: CardT): Promise<CardData> {
  const txs = await db.transactions.where('cardId').equals(card.id).toArray();
  const plans = await db.installmentPlans.where('cardId').equals(card.id).filter((p) => !p.deletedAt).toArray();
  const storedRows = await db.cardStatements.where('cardId').equals(card.id).filter((s) => !s.deletedAt).toArray();
  const byId = new Map(storedRows.map((s) => [s.id, s]));
  const statements = computeStatements(card, txs, plans, (sid) => byId.get(sid)?.chargeDate);
  const stored = new Map(storedRows.map((s) => [s.chargeDate, s]));
  const paidChargeDates = new Set(storedRows.filter((s) => s.status === 'paid').map((s) => s.chargeDate));
  return { card, statements, stored, paidChargeDates, plans };
}

/**
 * Runs at app open (SPEC 10.2): stores statement rows, updates open/closed status, and for every
 * statement whose charge date has come creates ONE `card_payment` from the billing account.
 * Idempotent: a statement is marked `paid` in the same transaction that creates its payment.
 *
 * DECISION: statements charged before the card was added to the app are marked paid without a
 * payment, because the bank's opening balance already includes them (no double counting).
 */
export async function syncCardStatements(db: FinanceDB, today: string = todayIL()): Promise<number> {
  let created = 0;
  const cards = await db.cards.filter((c) => !c.deletedAt && c.kind === 'credit').toArray();
  for (const card of cards) {
    await db.transaction('rw', [db.transactions, db.cardStatements, db.installmentPlans, db.cards], async () => {
      const data = await loadCardData(db, card);
      const trackingStart = todayIL(new Date(card.createdAt));
      const due = new Set(dueForPayment(data.statements, data.paidChargeDates, today).map((s) => s.chargeDate));

      for (const s of data.statements) {
        let row = data.stored.get(s.chargeDate);
        const ts = nowIso();
        if (!row) {
          row = { ...newSystemFields(), cardId: card.id, chargeDate: s.chargeDate, periodStart: s.periodStart, periodEnd: s.periodEnd, status: statementStatus(s, false, today) };
          await db.cardStatements.add(row);
        } else if (row.status !== 'paid') {
          const status = statementStatus(s, false, today);
          if (status !== row.status) await db.cardStatements.update(row.id, { status, updatedAt: ts });
        }
        if (!due.has(s.chargeDate) || row.status === 'paid') continue;

        let paymentTransactionId: string | undefined;
        if (s.total > 0 && s.chargeDate >= trackingStart) {
          const payment = await createTransaction(db, {
            kind: 'card_payment',
            amountAgorot: s.total,
            date: s.chargeDate,
            accountId: card.billingAccountId,
            context: card.context,
            status: 'cleared',
            source: 'system',
            description: card.name,
            links: { statementId: row.id },
          });
          paymentTransactionId = payment.id;
          created++;
        }
        await db.cardStatements.update(row.id, { status: 'paid', paymentTransactionId, updatedAt: ts });
      }
    });
  }
  return created;
}

/** When the bank charged a different amount, or purchases were added after payment: align the payment to the statement. */
export async function setStatementPayment(db: FinanceDB, statementId: string, amountAgorot: number): Promise<void> {
  const st = await db.cardStatements.get(statementId);
  if (!st?.paymentTransactionId) throw new Error('no_payment');
  await db.transactions.update(st.paymentTransactionId, { amountAgorot, updatedAt: nowIso() });
}
