import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/** All "today" logic uses Israel time, regardless of the device's timezone. */
export const TIME_ZONE = 'Asia/Jerusalem';

/** Week starts on Sunday (SPEC 4). */
export const WEEK_STARTS_ON = 0 as const;

/** Today's date in Israel, as YYYY-MM-DD. */
export function todayIL(now: Date = new Date()): string {
  return format(new TZDate(now.getTime(), TIME_ZONE), 'yyyy-MM-dd');
}

/** Current month in Israel, as YYYY-MM. */
export function currentMonthIL(now: Date = new Date()): string {
  return todayIL(now).slice(0, 7);
}

/** "2026-09-30" → "30/09/2026". */
export function formatDisplayDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new RangeError(`not an ISO date: ${isoDate}`);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** "2026-09" → "09/2026". */
export function formatDisplayMonth(isoMonth: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(isoMonth);
  if (!m) throw new RangeError(`not an ISO month: ${isoMonth}`);
  return `${m[2]}/${m[1]}`;
}

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Parses DD/MM/YYYY or DD/MM/YY (also with "." or "-" separators) into YYYY-MM-DD.
 * Two-digit years map to 2000–2099 (bank and card statements are recent).
 * Returns null for invalid or non-existent dates.
 */
export function parseDisplayDate(input: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(input.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (!isRealDate(y, mo, d)) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). Timezone-free: compares calendar dates. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new RangeError('invalid date');
  return Math.round((b - a) / 86_400_000);
}

/** Current timestamp for createdAt / updatedAt. */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}
