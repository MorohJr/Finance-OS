import { afterEach, describe, expect, it } from 'vitest';
import { FinanceDB } from '../../db/db';
import { createAccount, updateAccount } from '../../services/accounts';
import { createCard, updateCard } from '../../services/cards';
import { exportBackup, parseBackup, restoreBackup } from '../../services/backup';

const dbs: FinanceDB[] = [];
afterEach(async () => {
  while (dbs.length) await dbs.pop()!.delete();
});

async function fresh() {
  const db = new FinanceDB(`l-${crypto.randomUUID()}`);
  dbs.push(db);
  await db.open();
  return db;
}

describe('own images for accounts and cards (owner request 01/10/2026)', () => {
  it('saves, keeps and clears an account and card image; images survive a backup', async () => {
    const db = await fresh();
    // saveAttachment compresses through canvas APIs that jsdom lacks; store the row directly.
    const logo = crypto.randomUUID();
    const blob = new Blob(['x'], { type: 'image/png' });
    await db.attachments.add({ id: logo, blob, mime: 'image/png', size: blob.size, createdAt: new Date().toISOString() });
    const acc = await createAccount(db, { name: 'PayPal', kind: 'platform', context: 'personal', isVisibleOnDashboard: true, logoAttachmentId: logo });
    expect((await db.accounts.get(acc.id))!.logoAttachmentId).toBe(logo);
    await updateAccount(db, acc.id, { name: 'PayPal', kind: 'platform', context: 'personal', isVisibleOnDashboard: true, logoAttachmentId: undefined });
    expect((await db.accounts.get(acc.id))!.logoAttachmentId).toBeUndefined();

    const bank = await createAccount(db, { name: 'עו"ש', kind: 'bank', context: 'personal', isVisibleOnDashboard: true });
    const issuer = (await db.institutions.where('kind').equals('card_issuer').first())!;
    const base = { name: 'אמקס', issuerId: issuer.id, last4: '1234', kind: 'credit' as const, billingAccountId: bank.id, chargeDay: 2, cycleCutoffDay: null, context: 'personal' as const };
    const card = await createCard(db, { ...base, logoAttachmentId: logo });
    await updateCard(db, card.id, { ...base, name: 'אמקס פלטינום', logoAttachmentId: logo });
    expect((await db.cards.get(card.id))!.logoAttachmentId).toBe(logo);

    const backup = await exportBackup(db);
    const db2 = await fresh();
    await restoreBackup(db2, await parseBackup(backup));
    expect((await db2.cards.get(card.id))!.logoAttachmentId).toBe(logo);
    expect(await db2.attachments.get(logo)).toBeTruthy();
  });
});
