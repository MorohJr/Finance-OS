import type { ParsedRow } from './parse';
import { normalizeDescription } from './parse';

/**
 * importHash (SPEC 9.3) = hash(target, date, amount, normalized description, installment number).
 * Identical rows in the same file (two coffees the same day) get an occurrence suffix, so both are
 * imported the first time and both recognized the second time.
 */
export function hashKey(targetId: string, r: Pick<ParsedRow, 'date' | 'flow' | 'amountAgorot' | 'description' | 'installment'>): string {
  const signed = r.flow === 'out' ? -r.amountAgorot : r.amountAgorot;
  return [targetId, r.date, signed, normalizeDescription(r.description), r.installment?.number ?? ''].join('|');
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function importHashes(targetId: string, rows: readonly ParsedRow[]): Promise<string[]> {
  const seen = new Map<string, number>();
  return Promise.all(
    rows.map((r) => {
      const key = hashKey(targetId, r);
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return sha256Hex(`${key}#${n}`);
    }),
  );
}
