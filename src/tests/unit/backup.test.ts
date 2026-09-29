import { afterEach, describe, expect, it } from 'vitest';
import { FinanceDB, TABLE_NAMES } from '../../db/db';
import { BackupError, exportBackup, isEncryptedBackup, markBackupDone, parseBackup, restoreBackup } from '../../services/backup';
import { WrongPasswordError } from '../../services/crypto';
import { SETTINGS_ID } from '../../domain/schemas';

const ts = '2026-09-30T09:00:00.000Z';
const dbs: FinanceDB[] = [];

async function freshDb(): Promise<FinanceDB> {
  const db = new FinanceDB(`t-${crypto.randomUUID()}`);
  dbs.push(db);
  await db.open();
  return db;
}

async function snapshot(db: FinanceDB) {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLE_NAMES) {
    const rows = await db.table(t).toArray();
    out[t] = await Promise.all(
      rows.map(async (r) => ('blob' in r ? { ...r, blob: Array.from(new Uint8Array(await (r.blob as Blob).arrayBuffer())) } : r)),
    );
    out[t]!.sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)));
  }
  return out;
}

async function addSampleData(db: FinanceDB) {
  const accountId = crypto.randomUUID();
  const attachmentId = crypto.randomUUID();
  await db.accounts.add({ id: accountId, createdAt: ts, updatedAt: ts, name: 'עו"ש', kind: 'bank', context: 'personal', isVisibleOnDashboard: true, status: 'active' });
  await db.transactions.add({
    id: crypto.randomUUID(), createdAt: ts, updatedAt: ts, date: '2026-09-01', kind: 'opening_balance', direction: 'in',
    amountAgorot: 100_000, accountId, context: 'personal', source: 'manual', status: 'cleared', tags: [], attachmentIds: [attachmentId],
  });
  await db.attachments.add({ id: attachmentId, blob: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' }), mime: 'image/jpeg', size: 4, createdAt: ts });
}

afterEach(async () => {
  while (dbs.length) await dbs.pop()!.delete();
});

describe('backup and restore (stage 0 acceptance: full round trip)', () => {
  it('plain round trip restores identical data', async () => {
    const source = await freshDb();
    await addSampleData(source);
    const text = await exportBackup(source);
    expect(isEncryptedBackup(text)).toBe(false);

    const target = await freshDb();
    const parsed = await parseBackup(text);
    expect(parsed.counts.transactions).toBe(1);
    await restoreBackup(target, parsed);

    expect(await snapshot(target)).toEqual(await snapshot(source));
  });

  it('encrypted round trip, and wrong password is rejected', async () => {
    const source = await freshDb();
    await addSampleData(source);
    const text = await exportBackup(source, { password: 'סיסמה-חזקה' });
    expect(isEncryptedBackup(text)).toBe(true);
    expect(text).not.toContain('עו"ש');

    await expect(parseBackup(text)).rejects.toMatchObject({ code: 'needs_password' });
    await expect(parseBackup(text, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);

    const target = await freshDb();
    await restoreBackup(target, await parseBackup(text, 'סיסמה-חזקה'));
    expect(await snapshot(target)).toEqual(await snapshot(source));
  });

  it('restore replaces existing data', async () => {
    const source = await freshDb();
    const text = await exportBackup(source);
    const target = await freshDb();
    await addSampleData(target);
    await restoreBackup(target, await parseBackup(text));
    expect(await target.transactions.count()).toBe(0);
    expect(await target.accounts.count()).toBe(0);
  });

  it('invalid data is rejected and nothing is written', async () => {
    const source = await freshDb();
    await addSampleData(source);
    const file = JSON.parse(await exportBackup(source));
    file.data.transactions[0].amountAgorot = 10.5; // float money
    await expect(parseBackup(JSON.stringify(file))).rejects.toMatchObject({ code: 'invalid_data' });
  });

  it('rejects non-backups and newer versions', async () => {
    await expect(parseBackup('not json')).rejects.toBeInstanceOf(BackupError);
    await expect(parseBackup('{"hello":1}')).rejects.toMatchObject({ code: 'not_a_backup' });
    const source = await freshDb();
    const file = JSON.parse(await exportBackup(source));
    file.schemaVersion = 999;
    await expect(parseBackup(JSON.stringify(file))).rejects.toMatchObject({ code: 'newer_version' });
  });

  it('marks the backup time for the 7-day reminder', async () => {
    const db = await freshDb();
    await markBackupDone(db, new Date(ts));
    expect((await db.settings.get(SETTINGS_ID))?.lastBackupAt).toBe(ts);
  });
});
