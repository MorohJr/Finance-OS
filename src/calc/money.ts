/**
 * Money primitives. All amounts are integer agorot (CLAUDE.md iron rule 1),
 * all percentages are integer basis points (18% = 1800).
 * No floats touch money here: division is integer division with explicit rounding.
 */

export const BP_SCALE = 10_000;

function assertInt(n: number, name: string): void {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${name} must be a safe integer, got ${n}`);
}

/**
 * numerator / denominator, rounded half-up to the nearest integer.
 * "Half-up" is symmetric (half away from zero), so -2.5 → -3, matching 2.5 → 3.
 */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  assertInt(numerator, 'numerator');
  assertInt(denominator, 'denominator');
  if (denominator === 0) throw new RangeError('division by zero');
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  // floor((2n + d) / 2d) == round-half-up(n / d) for non-negative integers.
  const q = Math.floor((2 * n + d) / (2 * d));
  return sign * q === 0 ? 0 : sign * q;
}

/** agorot × bp, rounded half-up to the agora. E.g. mulBp(500000, 1800) = 90000 (₪900). */
export function mulBp(agorot: number, bp: number): number {
  assertInt(agorot, 'agorot');
  assertInt(bp, 'bp');
  return divRoundHalfUp(agorot * bp, BP_SCALE);
}

/** Sum of integer agorot. Throws on non-integers so float bugs surface immediately. */
export function sumAgorot(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    assertInt(v, 'value');
    total += v;
  }
  assertInt(total, 'total');
  return total;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

const groupFormatter = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0, useGrouping: true });

export const MINUS = '−'; // U+2212, typographic minus

export interface FormatOptions {
  /** Hide the agorot part (rounded half-up to whole shekels). */
  hideAgorot?: boolean;
  /** Always show a sign, including "+" for positive amounts. */
  signed?: boolean;
}

/** 123456 → "₪1,234.56". Negative → "−₪1,234.56". */
export function formatAgorot(agorot: number, options: FormatOptions = {}): string {
  assertInt(agorot, 'agorot');
  const negative = agorot < 0;
  const abs = Math.abs(agorot);
  let body: string;
  if (options.hideAgorot) {
    body = groupFormatter.format(divRoundHalfUp(abs, 100));
  } else {
    const shekels = Math.floor(abs / 100);
    const cents = abs % 100;
    body = `${groupFormatter.format(shekels)}.${String(cents).padStart(2, '0')}`;
  }
  const sign = negative ? MINUS : options.signed && agorot > 0 ? '+' : '';
  return `${sign}₪${body}`;
}

/** 1800 → "18%", 6667 → "66.67%", −50 → "−0.5%". */
export function formatBp(bp: number): string {
  assertInt(bp, 'bp');
  const sign = bp < 0 ? MINUS : '';
  const abs = Math.abs(bp);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${frac === 0 ? whole : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`}%`;
}

/** Whole percent for charts and shares: 4749 → "47%", 4750 → "48%", −1234 → "−12%". */
export function formatBpWhole(bp: number): string {
  assertInt(bp, 'bp');
  const sign = bp < 0 ? MINUS : '';
  return `${sign}${divRoundHalfUp(Math.abs(bp), 100)}%`;
}

// ---------------------------------------------------------------------------
// Parsing (forms and imports). String-based, never via parseFloat.
// ---------------------------------------------------------------------------

/**
 * Parses user or file input into agorot.
 * Accepts "1,234.56", "₪1,234.5", "1234", "-12.30", "12.30-" (bank-statement trailing minus), "(12.30)".
 * Returns null when the input is not a valid amount. Rejects more than 2 decimal places.
 */
export function parseAmountToAgorot(input: string): number | null {
  let s = input.trim().replace(/[₪\s‎‏]/g, '').replace(/ש"ח|ש״ח|NIS|ILS/gi, '');
  if (s === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/^[-−]/.test(s)) {
    negative = !negative;
    s = s.slice(1);
  } else if (/[-−]$/.test(s)) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith('+')) s = s.slice(1);
  // Grouping commas only in valid positions.
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
  s = s.replace(/,/g, '');
  const [intPart = '0', fracPart = ''] = s.split('.');
  const agorot = Number(intPart || '0') * 100 + Number(fracPart.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(agorot)) return null;
  return negative ? -agorot : agorot;
}

/** "18" → 1800, "66.67" → 6667, "4.45%" → 445. Up to 2 decimal places. */
export function parsePercentToBp(input: string): number | null {
  const s = input.trim().replace('%', '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [intPart = '0', fracPart = ''] = s.split('.');
  return Number(intPart) * 100 + Number(fracPart.padEnd(2, '0') || '0');
}
