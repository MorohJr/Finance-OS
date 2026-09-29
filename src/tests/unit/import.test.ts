import { afterEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { decodeText, readGrid } from '../../import/read';
import { findHeaderRow, guessMapping, headersOf, matchPreset, headerSignature } from '../../import/mapping';
import { parseRows } from '../../import/parse';
import { FinanceDB } from '../../db/db';
import { createAccount } from '../../services/accounts';
import { createCard, loadCardData, saveTransactionWithInstallments } from '../../services/cards';
import { commitImport, previewImport, savePreset, undoImport } from '../../services/import';
import { createRule } from '../../services/rules';
import { accountBalance } from '../../calc/balance';
import { cardStatus } from '../../calc/cards';

// A card statement like Israeli issuers export: preamble lines, header row, installments, total.
const CARD_CSV = [
  'פירוט עסקאות לכרטיס ויזה 4821',
  'תקופה: 09/2026',
  '',
  'תאריך עסקה,שם בית העסק,סכום עסקה,סכום חיוב,תאריך חיוב,פירוט נוסף',
  '05/09/2026,שופרסל דיל,342.90,342.90,10/10/2026,',
  '07/09/2026,קפה גרג,18.00,18.00,10/10/2026,',
  '07/09/2026,קפה גרג,18.00,18.00,10/10/2026,',
  '12/07/2026,KSP מחשבים,"2,400.00",400.00,10/10/2026,תשלום 3 מתוך 6',
  '15/09/2026,זיכוי אמזון,-50.00,-50.00,10/10/2026,',
  ',סה"כ לחיוב,,"1,128.90",10/10/2026,',
].join('\n');

const enc = (s: string) => new TextEncoder().encode(s);

/** Minimal windows-1255 encoder for Hebrew letters (test only). */
function cp1255(s: string): Uint8Array {
  return Uint8Array.from([...s].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 0x05d0 && c <= 0x05ea) return 0xe0 + (c - 0x05d0);
    return c;
  }));
}

describe('reading files', () => {
  it('decodes windows-1255 CSV', () => {
    expect(decodeText(cp1255('תאריך,סכום'))).toBe('תאריך,סכום');
    expect(decodeText(enc('﻿תאריך'))).toBe('תאריך');
  });

  it('finds the header row after preamble lines and guesses the mapping', () => {
    const grid = readGrid(enc(CARD_CSV), 'card.csv');
    const h = findHeaderRow(grid);
    expect(h).toBe(3); // row index = file line − 1, blank lines kept
    const headers = headersOf(grid, h);
    expect(guessMapping(headers)).toEqual({
      transactionDate: 'תאריך עסקה',
      description: 'שם בית העסק',
      originalAmount: 'סכום עסקה',
      chargeAmount: 'סכום חיוב',
      chargeDate: 'תאריך חיוב',
      note: 'פירוט נוסף',
    });
  });

  it('parses card rows: purchases out, refunds in, installments, totals', () => {
    const grid = readGrid(enc(CARD_CSV), 'card.csv');
    const h = findHeaderRow(grid);
    const headers = headersOf(grid, h);
    const r = parseRows(grid, h, headers, guessMapping(headers), 'card');
    expect(r.rows).toHaveLength(5);
    expect(r.rows[0]).toMatchObject({ date: '2026-09-05', chargeDate: '2026-10-10', flow: 'out', amountAgorot: 34_290 });
    expect(r.rows[3]).toMatchObject({ flow: 'out', amountAgorot: 40_000, originalAmountAgorot: 240_000, installment: { number: 3, count: 6 } });
    expect(r.rows[4]).toMatchObject({ flow: 'in', amountAgorot: 5_000 });
    expect(r.totals).toEqual([{ line: 10, amountAgorot: 112_890, chargeDate: '2026-10-10' }]);
  });

  it('reads an XLSX bank file with debit/credit columns and Excel dates', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['בנק לאומי - תנועות בחשבון'],
      ['תאריך', 'תיאור', 'חובה', 'זכות', 'יתרה'],
      [new Date(Date.UTC(2026, 8, 9)), 'משכורת', null, 14250, 20000],
      [new Date(Date.UTC(2026, 8, 10)), 'ישראכרט', 1128.9, null, 18871.1],
    ], { cellDates: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'x');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const grid = readGrid(bytes, 'bank.xlsx');
    const h = findHeaderRow(grid);
    const headers = headersOf(grid, h);
    const mapping = guessMapping(headers);
    expect(mapping).toMatchObject({ transactionDate: 'תאריך', description: 'תיאור', debit: 'חובה', credit: 'זכות' });
    const r = parseRows(grid, h, headers, mapping, 'bank');
    expect(r.rows.map((x) => [x.date, x.flow, x.amountAgorot])).toEqual([
      ['2026-09-09', 'in', 1_425_000],
      ['2026-09-10', 'out', 112_890],
    ]);
  });

  it('presets are recognized by header signature', () => {
    const headers = ['תאריך עסקה', 'שם בית העסק', 'סכום חיוב'];
    expect(matchPreset([{ headerSignature: headerSignature(headers) }], [...headers])).toBeDefined();
    expect(matchPreset([{ headerSignature: headerSignature(headers) }], ['תאריך', 'סכום'])).toBeUndefined();
  });
});

const dbs: FinanceDB[] = [];
afterEach(async () => {
  while (dbs.length) await dbs.pop()!.delete();
});

async function setup() {
  const db = new FinanceDB(`i-${crypto.randomUUID()}`);
  dbs.push(db);
  await db.open();
  const bank = await createAccount(db, { name: 'עו"ש', kind: 'bank', context: 'personal', isVisibleOnDashboard: true }, 1_000_000, '2026-01-01');
  const issuer = (await db.institutions.where('kind').equals('card_issuer').first())!;
  const card = await createCard(db, { name: 'ויזה', issuerId: issuer.id, last4: '4821', kind: 'credit', billingAccountId: bank.id, chargeDay: 10, cycleCutoffDay: null, creditLimit: 2_000_000, context: 'personal' });
  await db.cards.update(card.id, { createdAt: '2026-01-01T00:00:00.000Z' });
  return { db, bank, card: (await db.cards.get(card.id))! };
}

async function runImport(db: FinanceDB, target: Parameters<typeof previewImport>[1], bytes: Uint8Array, name: string) {
  const grid = readGrid(bytes, name);
  const h = findHeaderRow(grid);
  const headers = headersOf(grid, h);
  const parsed = parseRows(grid, h, headers, guessMapping(headers), target.kind);
  const preview = await previewImport(db, target, parsed);
  const batch = await commitImport(db, { target, fileName: name, rows: preview.rows, totals: parsed.totals, rowCount: parsed.rows.length });
  return { preview, batch };
}

describe('import flow (stage 4 acceptance)', () => {
  it('importing the same file twice creates no duplicates; identical rows in one file are both kept', async () => {
    const { db, card } = await setup();
    const first = await runImport(db, { kind: 'card', card }, enc(CARD_CSV), 'card.csv');
    expect(first.batch.createdCount).toBe(5);
    expect(await db.transactions.where('cardId').equals(card.id).count()).toBe(5);

    const second = await runImport(db, { kind: 'card', card }, enc(CARD_CSV), 'card.csv');
    expect(second.batch.createdCount).toBe(0);
    expect(second.preview.rows.every((r) => !r.include)).toBe(true);
    expect(await db.transactions.where('cardId').equals(card.id).count()).toBe(5);
  });

  it('installment row becomes a plan with firstChargeDate computed backwards; statement total kept', async () => {
    const { db, card } = await setup();
    await runImport(db, { kind: 'card', card }, enc(CARD_CSV), 'card.csv');
    const plan = (await db.installmentPlans.toArray())[0]!;
    expect(plan).toMatchObject({ count: 6, totalAgorot: 240_000, firstChargeDate: '2026-08-10' });
    const data = await loadCardData(db, card);
    const oct = data.statements.find((s) => s.chargeDate === '2026-10-10')!;
    // 342.90 + 18 + 18 + 400 (3rd of 6) − 50
    expect(oct.total).toBe(72_890);
    expect(data.stored.get('2026-10-10')?.importedTotal).toBe(112_890);
    expect(cardStatus(card, data.statements, data.paidChargeDates, '2026-09-20').openStatementTotal).toBeGreaterThan(0);
  });

  it('next month the same installment matches the existing plan instead of a new one', async () => {
    const { db, card } = await setup();
    await runImport(db, { kind: 'card', card }, enc(CARD_CSV), 'card.csv');
    const next = ['תאריך עסקה,שם בית העסק,סכום עסקה,סכום חיוב,תאריך חיוב,פירוט נוסף', '12/07/2026,KSP מחשבים,"2,400.00",400.00,10/11/2026,תשלום 4 מתוך 6'].join('\n');
    const r = await runImport(db, { kind: 'card', card }, enc(next), 'nov.csv');
    expect(r.preview.rows[0]?.action).toBe('existing_plan');
    expect(await db.installmentPlans.count()).toBe(1);
  });

  it('rules categorize imported rows; undo removes the whole batch', async () => {
    const { db, card } = await setup();
    const food = (await db.categories.filter((c) => c.name === 'מזון וסופר').first())!;
    await createRule(db, 'שופרסל', food.id);
    const { batch } = await runImport(db, { kind: 'card', card }, enc(CARD_CSV), 'card.csv');
    const shufersal = await db.transactions.filter((t) => t.description === 'שופרסל דיל').first();
    expect(shufersal?.categoryId).toBe(food.id);
    expect(await undoImport(db, batch.id)).toBe(5);
    expect(await db.transactions.filter((t) => !t.deletedAt && t.cardId === card.id).count()).toBe(0);
    expect(await db.installmentPlans.filter((p) => !p.deletedAt).count()).toBe(0);
  });

  it('bank file: the card charge row is skipped because the app already creates it', async () => {
    const { db, bank, card } = await setup();
    await saveTransactionWithInstallments(db, undefined, { kind: 'expense', amountAgorot: 112_890, date: '2026-09-05', cardId: card.id, context: 'personal', status: 'cleared' });
    const csv = ['תאריך,תיאור,חובה,זכות', '09/09/2026,משכורת,,"14,250.00"', '10/10/2026,ויזה כאל,"1,128.90",'].join('\n');
    const { preview, batch } = await runImport(db, { kind: 'bank', accountId: bank.id }, enc(csv), 'bank.csv');
    expect(preview.rows[1]?.flags.cardPayment).toBe('ויזה');
    expect(batch.createdCount).toBe(1);
    expect(accountBalance(bank.id, await db.transactions.toArray())).toBe(1_000_000 + 1_425_000);
  });

  it('a manual entry with the same amount within 2 days is flagged as a duplicate', async () => {
    const { db, bank } = await setup();
    await saveTransactionWithInstallments(db, undefined, { kind: 'expense', amountAgorot: 34_290, date: '2026-09-04', accountId: bank.id, context: 'personal', status: 'cleared' });
    const csv = ['תאריך,תיאור,סכום', '05/09/2026,שופרסל,-342.90'].join('\n');
    const { preview } = await runImport(db, { kind: 'bank', accountId: bank.id }, enc(csv), 'b.csv');
    expect(preview.rows[0]?.flags.duplicate).toBe('manual');
    expect(preview.rows[0]?.include).toBe(false);
  });

  it('saves a preset', async () => {
    const { db } = await setup();
    const p = await savePreset(db, 'לאומי', ['תאריך', 'תיאור', 'סכום'], { transactionDate: 'תאריך', description: 'תיאור', signedAmount: 'סכום' });
    expect(p.headerSignature).toEqual(['תאריך', 'תיאור', 'סכום']);
  });
});

describe('excel dates', () => {
  it('serials convert without timezone effects', async () => {
    const { excelSerialToIso } = await import('../../import/excelDate');
    expect(excelSerialToIso(46295)).toBe('2026-09-30');
    expect(excelSerialToIso(45352)).toBe('2024-03-01');
    expect(excelSerialToIso(10)).toBeNull();
  });
});
