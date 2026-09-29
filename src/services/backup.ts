import { z } from 'zod';
import * as S from '../domain/schemas';
import { SETTINGS_ID } from '../domain/schemas';
import { CURRENT_SCHEMA_VERSION, TABLE_NAMES, type FinanceDB, type TableName } from '../db/db';
import { nowIso } from '../calc/dates';
import { base64ToBytes, bytesToBase64, decryptText, encryptText, type EncryptedEnvelope } from './crypto';

/**
 * Full JSON backup (SPEC 12): every table, attachments as base64, schema version, optional encryption.
 * Restore replaces all data, after Zod validation and migration of older versions.
 */

export const BACKUP_FORMAT = 'finance-os-backup';

/** Attachment as stored in a backup file: the Blob becomes base64. */
const BackupAttachment = S.Attachment.omit({ blob: true }).extend({ dataBase64: z.string() });

const ROW_SCHEMAS: Record<TableName, z.ZodType> = {
  accounts: S.Account,
  cards: S.Card,
  transactions: S.Transaction,
  cardStatements: S.CardStatement,
  installmentPlans: S.InstallmentPlan,
  categories: S.Category,
  payees: S.Payee,
  categoryRules: S.CategoryRule,
  recurring: S.Recurring,
  wishItems: S.WishItem,
  loans: S.Loan,
  lendings: S.Lending,
  checks: S.Check,
  netWorthSnapshots: S.NetWorthSnapshot,
  sectors: S.Sector,
  securities: S.Security,
  investmentTrades: S.InvestmentTrade,
  pricePoints: S.PricePoint,
  fxRates: S.FxRate,
  pensionFunds: S.PensionFund,
  pensionSnapshots: S.PensionSnapshot,
  employers: S.Employer,
  payslips: S.Payslip,
  businesses: S.Business,
  expenseClasses: S.ExpenseClass,
  taxSettings: S.TaxSettings,
  budgetOverrides: S.BudgetOverride,
  importBatches: S.ImportBatch,
  importPresets: S.ImportPreset,
  attachments: BackupAttachment,
  institutions: S.Institution,
  settings: S.Settings,
};

type BackupData = Partial<Record<TableName, unknown[]>>;

const PlainBackup = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.int().positive(),
  exportedAt: z.string(),
  encrypted: z.literal(false),
  data: z.record(z.string(), z.array(z.unknown())),
});

const EncryptedBackup = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.int().positive(),
  exportedAt: z.string(),
  encrypted: z.literal(true),
  kdf: z.object({ name: z.literal('PBKDF2'), hash: z.literal('SHA-256'), iterations: z.int().positive(), salt: z.string() }),
  cipher: z.object({ name: z.literal('AES-GCM'), iv: z.string() }),
  ciphertext: z.string(),
});

const AnyBackup = z.discriminatedUnion('encrypted', [PlainBackup, EncryptedBackup]);

export class BackupError extends Error {
  constructor(
    public readonly code: 'not_a_backup' | 'newer_version' | 'needs_password' | 'invalid_data',
    public readonly details?: string,
  ) {
    super(details ? `${code}: ${details}` : code);
    this.name = 'BackupError';
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

async function collectData(db: FinanceDB): Promise<BackupData> {
  const data: BackupData = {};
  for (const name of TABLE_NAMES) {
    if (name === 'attachments') {
      const rows = await db.attachments.toArray();
      data.attachments = await Promise.all(
        rows.map(async ({ blob, ...rest }) => ({ ...rest, dataBase64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) })),
      );
    } else {
      data[name] = await db.table(name).toArray();
    }
  }
  return data;
}

/** Serializes the whole database. With a password, the data is AES-GCM encrypted. */
export async function exportBackup(db: FinanceDB, options: { password?: string; now?: Date } = {}): Promise<string> {
  const data = await collectData(db);
  const header = { format: BACKUP_FORMAT, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: nowIso(options.now) };
  if (options.password) {
    const envelope: EncryptedEnvelope = await encryptText(JSON.stringify(data), options.password);
    return JSON.stringify({ ...header, encrypted: true, ...envelope });
  }
  return JSON.stringify({ ...header, encrypted: false, data });
}

/** File name like finance-os-backup-2026-09-30.json */
export function backupFileName(isoDate: string): string {
  return `finance-os-backup-${isoDate}.json`;
}

/** Records the backup time so the 7-day reminder resets (SPEC 12). */
export async function markBackupDone(db: FinanceDB, now: Date = new Date()): Promise<void> {
  const ts = nowIso(now);
  await db.settings.update(SETTINGS_ID, { lastBackupAt: ts, updatedAt: ts });
}

// ---------------------------------------------------------------------------
// Parse + validate
// ---------------------------------------------------------------------------

export interface ParsedBackup {
  schemaVersion: number;
  exportedAt: string;
  /** Validated rows, ready to write. Attachments already converted back to Blobs. */
  tables: Record<TableName, unknown[]>;
  counts: Record<TableName, number>;
}

/** Peeks at a file without a password, to know whether to ask for one. */
export function isEncryptedBackup(text: string): boolean {
  try {
    const parsed = AnyBackup.safeParse(JSON.parse(text));
    return parsed.success && parsed.data.encrypted;
  } catch {
    return false;
  }
}

/**
 * Migrations of backup data, keyed by the version they migrate FROM (n → n+1).
 * Add a step here for every Dexie version bump (CLAUDE.md iron rule 8).
 */
const MIGRATIONS: Record<number, (data: BackupData) => BackupData> = {};

function migrate(data: BackupData, fromVersion: number): BackupData {
  let current = data;
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new BackupError('invalid_data', `no migration from schema version ${v}`);
    current = step(current);
  }
  return current;
}

export async function parseBackup(text: string, password?: string): Promise<ParsedBackup> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('not_a_backup');
  }
  const envelope = AnyBackup.safeParse(json);
  if (!envelope.success) throw new BackupError('not_a_backup');
  const file = envelope.data;
  if (file.schemaVersion > CURRENT_SCHEMA_VERSION) throw new BackupError('newer_version');

  let raw: BackupData;
  if (file.encrypted) {
    if (!password) throw new BackupError('needs_password');
    const plaintext = await decryptText(file, password); // throws WrongPasswordError
    raw = z.record(z.string(), z.array(z.unknown())).parse(JSON.parse(plaintext)) as BackupData;
  } else {
    raw = file.data as BackupData;
  }

  const data = migrate(raw, file.schemaVersion);

  const unknownTables = Object.keys(data).filter((t) => !(TABLE_NAMES as string[]).includes(t));
  if (unknownTables.length) throw new BackupError('invalid_data', `unknown tables: ${unknownTables.join(', ')}`);

  const tables = {} as Record<TableName, unknown[]>;
  const counts = {} as Record<TableName, number>;
  for (const name of TABLE_NAMES) {
    const rows = data[name] ?? [];
    const schema = ROW_SCHEMAS[name];
    const validated = rows.map((row, i) => {
      const r = schema.safeParse(row);
      if (!r.success) {
        throw new BackupError('invalid_data', `${name}[${i}]: ${r.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
      }
      return r.data;
    });
    tables[name] =
      name === 'attachments'
        ? (validated as z.infer<typeof BackupAttachment>[]).map(({ dataBase64, ...rest }) => ({
            ...rest,
            blob: new Blob([base64ToBytes(dataBase64)], { type: rest.mime }),
          }))
        : validated;
    counts[name] = validated.length;
  }
  if (tables.settings.length !== 1) throw new BackupError('invalid_data', 'settings row missing');

  return { schemaVersion: file.schemaVersion, exportedAt: file.exportedAt, tables, counts };
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Replaces ALL data with the backup, atomically: if anything fails, nothing changes.
 * The UI must get a double confirmation before calling this (SPEC 12).
 */
export async function restoreBackup(db: FinanceDB, backup: ParsedBackup): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name);
      await table.clear();
      await table.bulkAdd(backup.tables[name]);
    }
  });
}
