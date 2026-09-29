import type { FinanceDB } from '../db/db';
import { ImportBatch, ImportPreset, SETTINGS_ID, type ImportBatch as BatchT, type ImportPreset as PresetT } from '../domain/schemas';
import { cycleForChargeDate } from '../calc/cards';
import { nowIso } from '../calc/dates';
import { newSystemFields, validate } from './entity';
import { loadCardData, saveTransactionWithInstallments, syncCardStatements } from './cards';
import { headerSignature, type Mapping } from '../import/mapping';
import { importHashes } from '../import/dedupe';
import { buildPreview, type ImportTarget, type PreviewResult, type PreviewRow } from '../import/preview';
import type { ParseResult } from '../import/parse';

/** Loads what the preview needs from the DB and builds it (SPEC 9.1 step 3). */
export async function previewImport(db: FinanceDB, target: ImportTarget, parsed: ParseResult): Promise<PreviewResult> {
  const targetId = target.kind === 'bank' ? target.accountId : target.card.id;
  const hashes = await importHashes(targetId, parsed.rows);
  const existing = await db.transactions.where('importHash').anyOf(hashes).filter((t) => !t.deletedAt).toArray();
  const targetTxs =
    target.kind === 'bank'
      ? await db.transactions.where('accountId').equals(target.accountId).filter((t) => !t.deletedAt).toArray()
      : await db.transactions.where('cardId').equals(target.card.id).filter((t) => !t.deletedAt).toArray();
  const plans = target.kind === 'card' ? await db.installmentPlans.where('cardId').equals(target.card.id).filter((p) => !p.deletedAt).toArray() : [];
  const billedStatements = [];
  if (target.kind === 'bank') {
    const cards = await db.cards.filter((c) => !c.deletedAt && c.kind === 'credit' && c.billingAccountId === target.accountId).toArray();
    for (const c of cards) billedStatements.push(...(await loadCardData(db, c)).statements.map((s) => ({ ...s, cardName: c.name })));
  }
  return buildPreview(parsed.rows, {
    target,
    hashes,
    existingHashes: new Set(existing.map((t) => t.importHash!)),
    targetTxs,
    plans,
    billedStatements,
    rules: await db.categoryRules.filter((r) => !r.deletedAt).toArray(),
    payees: await db.payees.filter((p) => !p.deletedAt).toArray(),
  });
}

async function statementIdFor(db: FinanceDB, target: ImportTarget, chargeDate: string | undefined): Promise<string | undefined> {
  if (target.kind !== 'card' || target.card.kind !== 'credit' || !chargeDate) return undefined;
  const card = target.card;
  const found = await db.cardStatements.where('[cardId+chargeDate]').equals([card.id, chargeDate]).filter((s) => !s.deletedAt).first();
  if (found) return found.id;
  const cycle = cycleForChargeDate(chargeDate, card);
  const row = { ...newSystemFields(), cardId: card.id, ...cycle, status: 'open' as const };
  await db.cardStatements.add(row);
  return row.id;
}

export interface CommitInput {
  target: ImportTarget;
  fileName: string;
  presetId?: string;
  rows: PreviewRow[];
  totals: ParseResult['totals'];
  rowCount: number;
}

/** Creates the transactions of the included rows, and an ImportBatch that can be undone (9.1 steps 4–5). */
export async function commitImport(db: FinanceDB, input: CommitInput): Promise<BatchT> {
  const { target } = input;
  const settings = await db.settings.get(SETTINGS_ID);
  const targetContext = target.kind === 'card' ? target.card.context : ((await db.accounts.get(target.accountId))?.context ?? 'personal');
  const batch = validate(ImportBatch, {
    ...newSystemFields(),
    source: target.kind === 'card' ? `card:${target.card.id}` : `account:${target.accountId}`,
    fileName: input.fileName,
    importedAt: nowIso(),
    rowCount: input.rowCount,
    createdCount: 0,
    skippedDuplicates: input.rows.filter((r) => r.flags.duplicate).length,
    mappingPresetId: input.presetId,
  });

  let created = 0;
  await db.transaction('rw', [db.transactions, db.installmentPlans, db.cards, db.cardStatements, db.importBatches, db.accounts], async () => {
    await db.importBatches.add(batch);
    for (const r of input.rows) {
      if (!r.include || r.action === 'existing_plan') continue;
      const statementId = r.action === 'create' ? await statementIdFor(db, target, r.chargeDate) : undefined;
      const common = {
        date: r.row.date,
        categoryId: r.categoryId,
        payeeId: r.payeeId,
        description: r.row.description || undefined,
        note: r.row.note,
        context: r.context ?? targetContext,
        status: 'cleared' as const,
        source: 'import' as const,
        importHash: r.hash,
        accountId: target.kind === 'bank' ? target.accountId : undefined,
        cardId: target.kind === 'card' ? target.card.id : undefined,
        links: { importBatchId: batch.id, statementId },
      };
      if (r.action === 'new_plan' && r.plan) {
        await saveTransactionWithInstallments(db, undefined, { ...common, kind: 'expense', amountAgorot: r.plan.purchaseAmountAgorot }, {
          count: r.plan.count,
          kind: 'installments',
          budgetRecognition: settings?.defaultBudgetRecognition ?? 'spread',
          firstChargeDate: r.plan.firstChargeDate,
        });
      } else {
        await saveTransactionWithInstallments(db, undefined, { ...common, kind: r.txKind, amountAgorot: r.row.amountAgorot });
      }
      created++;
    }
    // SPEC 9.3: a statement total in the file is kept for comparison.
    if (target.kind === 'card') {
      const chargeDates = [...new Set(input.rows.map((r) => r.chargeDate).filter(Boolean))] as string[];
      for (const t of input.totals) {
        const chargeDate = t.chargeDate ?? (chargeDates.length === 1 ? chargeDates[0] : undefined);
        const sid = await statementIdFor(db, target, chargeDate);
        if (sid) await db.cardStatements.update(sid, { importedTotal: t.amountAgorot, updatedAt: nowIso() });
      }
    }
    await db.importBatches.update(batch.id, { createdCount: created });
  });
  await syncCardStatements(db);
  return { ...batch, createdCount: created };
}

/** Undo a whole import: soft-delete its transactions and plans (9.1 step 5). */
export async function undoImport(db: FinanceDB, batchId: string): Promise<number> {
  const ts = nowIso();
  let n = 0;
  await db.transaction('rw', [db.transactions, db.installmentPlans, db.importBatches], async () => {
    const txs = await db.transactions.filter((t) => t.links?.importBatchId === batchId && !t.deletedAt).toArray();
    for (const t of txs) {
      await db.transactions.update(t.id, { deletedAt: ts, updatedAt: ts });
      await db.installmentPlans.where('transactionId').equals(t.id).modify({ deletedAt: ts, updatedAt: ts });
      n++;
    }
    await db.importBatches.update(batchId, { deletedAt: ts, updatedAt: ts });
  });
  return n;
}

export async function savePreset(db: FinanceDB, name: string, headers: string[], mapping: Mapping, institutionId?: string, existingId?: string): Promise<PresetT> {
  const base = existingId ? await db.importPresets.get(existingId) : undefined;
  const row = validate(ImportPreset, {
    ...(base ? { id: base.id, createdAt: base.createdAt, updatedAt: nowIso() } : newSystemFields()),
    name,
    institutionId,
    headerSignature: headerSignature(headers),
    mapping,
  });
  await db.importPresets.put(row);
  return row;
}

