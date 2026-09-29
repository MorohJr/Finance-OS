import type { FinanceDB } from '../db/db';
import { SETTINGS_ID, type Settings } from '../domain/schemas';
import { nowIso } from '../calc/dates';

type EditableSettings = Omit<Settings, 'id' | 'createdAt' | 'updatedAt'>;

export async function updateSettings(db: FinanceDB, patch: Partial<EditableSettings>): Promise<void> {
  await db.settings.update(SETTINGS_ID, { ...patch, updatedAt: nowIso() });
}

/** True if the user has entered any of their own data (not just the seed). */
export async function hasUserData(db: FinanceDB, tables: readonly string[]): Promise<boolean> {
  for (const t of tables) {
    if ((await db.table(t).count()) > 0) return true;
  }
  return false;
}
