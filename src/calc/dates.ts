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

// ---------------------------------------------------------------------------
// Calendar arithmetic on YYYY-MM-DD strings (timezone-free).
// ---------------------------------------------------------------------------

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(iso: string): [number, number, number] {
  return iso.split('-').map(Number) as [number, number, number];
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Adds months keeping the day of month (SPEC 10.4). If the month is shorter, uses its last day.
 * `anchorDay` is the original day to return to in later months (e.g. 31 → 28/02 → 31/03).
 */
export function addMonths(isoDate: string, months: number, anchorDay?: number): string {
  const [y, m, d] = parts(isoDate);
  const day = anchorDay ?? d;
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = parts(isoDate);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Same month, given day (clamped to the month's length). */
export function withDay(isoDate: string, day: number): string {
  const [y, m] = parts(isoDate);
  return iso(y, m, Math.min(day, daysInMonth(y, m)));
}

export function dayOfMonth(isoDate: string): number {
  return parts(isoDate)[2];
}

/** Whole months from a to b by calendar month (YYYY-MM or YYYY-MM-DD). */
export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = parts(a.slice(0, 7) + '-01');
  const [yb, mb] = parts(b.slice(0, 7) + '-01');
  return (yb - ya) * 12 + (mb - ma);
}
