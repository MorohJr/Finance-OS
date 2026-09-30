import Dexie, { type EntityTable } from 'dexie';
import type { FinanceDB } from '../../db/db';
import { TABLE_NAMES } from '../../db/db';
import { SETTINGS_ID } from '../../domain/schemas';
import { buildSeedRows } from '../../db/seed';
import { monthRange, previousMonth } from '../../calc/cashflow';
import { addMonths, nowIso, todayIL } from '../../calc/dates';
import { exportBackup, parseBackup, restoreBackup } from '../backup';
import { netWorthAt } from '../networth';
import { newSystemFields } from '../entity';
import { generateDemo, type Progress } from './generate';

/**
 * Demo mode (owner request 01/10/2026, like the Fitness App): the real data is saved aside, the
 * app shows a year of demo data, and "החזר את הנתונים שלי" restores the real data exactly.
 *
 * The real data is kept as a full backup (the same format as the user's backups, so it's validated
 * on the way back) in a SEPARATE IndexedDB database. That keeps it out of backups, imports and
 * restores done while the demo is shown, and needs no change to the main schema.
 */

interface Stash {
  key: 'real';
  savedAt: string;
  backup: string;
}

class DemoStore extends Dexie {
  stash!: EntityTable<Stash, 'key'>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ stash: 'key' });
  }
}

const stores = new Map<string, DemoStore>();
function storeFor(db: FinanceDB): DemoStore {
  const name = `${db.name}-demo-stash`;
  if (!stores.has(name)) stores.set(name, new DemoStore(name));
  return stores.get(name)!;
}

export async function isDemoMode(db: FinanceDB): Promise<boolean> {
  return !!(await storeFor(db).stash.get('real'));
}

export async function demoSince(db: FinanceDB): Promise<string | undefined> {
  return (await storeFor(db).stash.get('real'))?.savedAt;
}

/** Replaces all data with a fresh seed, keeping the user's own settings (theme, PIN, preferences). */
async function resetToSeed(db: FinanceDB): Promise<void> {
  const settings = await db.settings.get(SETTINGS_ID);
  const seed = buildSeedRows();
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) await db.table(name).clear();
    await db.institutions.bulkAdd(seed.institutions);
    await db.categories.bulkAdd(seed.categories);
    await db.sectors.bulkAdd(seed.sectors);
    await db.expenseClasses.bulkAdd(seed.expenseClasses);
    await db.taxSettings.bulkAdd(seed.taxSettings);
    await db.settings.add({ ...(settings ?? seed.settings[0]!), lastBackupAt: nowIso(), lastNetWorthSnapshotMonth: undefined, updatedAt: nowIso() });
  });
}

/** Monthly net worth snapshots for the demo year, so "שווי נטו לאורך זמן" has a real curve. */
async function demoSnapshots(db: FinanceDB, today: string): Promise<void> {
  const last = previousMonth(today.slice(0, 7));
  for (let i = 11; i >= 0; i--) {
    const month = addMonths(`${last}-01`, -i).slice(0, 7);
    const nw = await netWorthAt(db, monthRange(month).to);
    await db.netWorthSnapshots.add({ ...newSystemFields(), month, assets: nw.assets, liabilities: nw.liabilities, netWorth: nw.netWorth, liquidAssets: nw.liquidAssets, breakdown: nw.breakdown });
  }
  await db.settings.update(SETTINGS_ID, { lastNetWorthSnapshotMonth: last });
}

/** Saves the real data first; only then replaces it. If saving fails, nothing is touched. */
export async function loadDemo(db: FinanceDB, progress: Progress = () => {}, today: string = todayIL()): Promise<void> {
  const store = storeFor(db);
  if (await store.stash.get('real')) throw new Error('already_in_demo');
  progress('שומר את הנתונים שלך בצד');
  const backup = await exportBackup(db);
  await parseBackup(backup); // the stash must be restorable before anything is replaced
  await store.stash.put({ key: 'real', savedAt: nowIso(), backup });
  try {
    await resetToSeed(db);
    await generateDemo(db, today, progress);
    progress('שווי נטו לאורך השנה');
    await demoSnapshots(db, today);
  } catch (e) {
    // Put the real data back if generation failed half-way.
    await restoreBackup(db, await parseBackup(backup));
    await store.stash.delete('real');
    throw e;
  }
}

/** "החזר את הנתונים שלי": restores exactly what was there before the demo. */
export async function exitDemo(db: FinanceDB): Promise<void> {
  const store = storeFor(db);
  const stash = await store.stash.get('real');
  if (!stash) throw new Error('not_in_demo');
  await restoreBackup(db, await parseBackup(stash.backup));
  await store.stash.delete('real');
}

/** Blocks actions that would mix demo data with the real data (restore, import, export). */
export async function assertNotDemo(db: FinanceDB): Promise<void> {
  if (await isDemoMode(db)) throw new Error('demo_mode');
}
