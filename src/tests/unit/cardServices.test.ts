import { afterEach, describe, expect, it } from 'vitest';
import { FinanceDB } from '../../db/db';
import { createAccount } from '../../services/accounts';
import { createCard, loadCardData, saveTransactionWithInstallments, syncCardStatements } from '../../services/cards';
import { accountBalance } from '../../calc/balance';
import { cardStatus } from '../../calc/cards';

const dbs: FinanceDB[] = [];
afterEach(async () => {
  while (dbs.length) await dbs.pop()!.delete();
});

async function setup(kind: 'credit' | 'debit' = 'credit') {
  const db = new FinanceDB(`c-${crypto.randomUUID()}`);
  dbs.push(db);
  await db.open();
  const bank = await createAccount(db, { name: 'עו"ש', kind: 'bank', context: 'personal', isVisibleOnDashboard: true }, 1_000_000, '2026-01-01');
  const issuer = (await db.institutions.where('kind').equals('card_issuer').first())!;
  const card = await createCard(db, { name: 'כאל ויזה', issuerId: issuer.id, last4: '4821', kind, billingAccountId: bank.id, chargeDay: 10, cycleCutoffDay: null, creditLimit: kind === 'credit' ? 1_000_000 : undefined, context: 'personal' });
  // Pretend the card has been tracked since January.
  await db.cards.update(card.id, { createdAt: '2026-01-01T08:00:00.000Z' });
  return { db, bank, card: (await db.cards.get(card.id))! };
}

const purchase = (cardId: string, amountAgorot: number, date: string) => ({ kind: 'expense' as const, amountAgorot, date, cardId, context: 'personal' as const, status: 'cleared' as const });

describe('credit card statements (stage 2 acceptance)', () => {
  it('a closed statement creates card_payment exactly once', async () => {
    const { db, bank, card } = await setup();
    await saveTransactionWithInstallments(db, undefined, purchase(card.id, 50_000, '2026-03-05'));
    await saveTransactionWithInstallments(db, undefined, purchase(card.id, 20_000, '2026-03-25'));

    // Purchases don't touch the bank until the charge date.
    expect(accountBalance(bank.id, await db.transactions.toArray())).toBe(1_000_000);
    expect(await syncCardStatements(db, '2026-04-09')).toBe(0);

    expect(await syncCardStatements(db, '2026-04-10')).toBe(1);
    expect(await syncCardStatements(db, '2026-04-11')).toBe(0);
    expect(await syncCardStatements(db, '2026-05-01')).toBe(0);

    const payments = await db.transactions.where('kind').equals('card_payment').toArray();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amountAgorot: 70_000, date: '2026-04-10', accountId: bank.id, source: 'system' });
    expect(accountBalance(bank.id, await db.transactions.toArray())).toBe(930_000);
    const st = await db.cardStatements.where('cardId').equals(card.id).first();
    expect(st).toMatchObject({ status: 'paid', paymentTransactionId: payments[0]!.id });
  });

  it('installments are charged one per statement (14.2 through services)', async () => {
    const { db, card } = await setup();
    await saveTransactionWithInstallments(db, undefined, purchase(card.id, 100_000, '2026-03-20'), { count: 3, kind: 'installments', budgetRecognition: 'spread' });
    const data = await loadCardData(db, card);
    expect(cardStatus(card, data.statements, data.paidChargeDates, '2026-03-21')).toMatchObject({ openStatementTotal: 33_334, futureInstallmentsTotal: 66_666, availableCredit: 900_000 });

    await syncCardStatements(db, '2026-06-10');
    const amounts = (await db.transactions.where('kind').equals('card_payment').sortBy('date')).map((t) => [t.date, t.amountAgorot]);
    expect(amounts).toEqual([
      ['2026-04-10', 33_334],
      ['2026-05-10', 33_333],
      ['2026-06-10', 33_333],
    ]);
  });

  it('statements charged before tracking started are marked paid without a payment', async () => {
    const { db, card } = await setup();
    await db.cards.update(card.id, { createdAt: '2026-05-01T08:00:00.000Z' });
    await saveTransactionWithInstallments(db, undefined, purchase(card.id, 10_000, '2026-03-05'));
    await syncCardStatements(db, '2026-05-02');
    expect(await db.transactions.where('kind').equals('card_payment').count()).toBe(0);
    expect((await db.cardStatements.toArray())[0]?.status).toBe('paid');
  });

  it('removing installments from a purchase deletes its plan', async () => {
    const { db, card } = await setup();
    const t = await saveTransactionWithInstallments(db, undefined, purchase(card.id, 90_000, '2026-03-20'), { count: 3, kind: 'installments', budgetRecognition: 'spread' });
    expect(t.links?.installmentPlanId).toBeDefined();
    await saveTransactionWithInstallments(db, t.id, purchase(card.id, 90_000, '2026-03-20'));
    expect(await db.installmentPlans.filter((p) => !p.deletedAt).count()).toBe(0);
  });
});

describe('debit card (10.2)', () => {
  it('charges the billing account immediately, no statements', async () => {
    const { db, bank, card } = await setup('debit');
    const t = await saveTransactionWithInstallments(db, undefined, purchase(card.id, 12_345, '2026-03-05'));
    expect(t.accountId).toBe(bank.id);
    expect(accountBalance(bank.id, await db.transactions.toArray())).toBe(1_000_000 - 12_345);
    await syncCardStatements(db, '2026-12-31');
    expect(await db.cardStatements.count()).toBe(0);
  });
});
