import type { FinanceDB } from '../db/db';
import { SETTINGS_ID } from '../domain/schemas';
import { nowIso } from '../calc/dates';
import { base64ToBytes, bytesToBase64 } from './crypto';

/**
 * Optional PIN lock (SPEC 3.4, 12): salted PBKDF2 hash, never the PIN itself.
 * Protection against a casual glance, not device encryption.
 */

export const PIN_ITERATIONS = 150_000;
export const LOCK_AFTER_MS = 5 * 60 * 1000; // lock after 5 minutes in the background

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function hashPin(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITERATIONS }, material, 256);
  return bytesToBase64(new Uint8Array(bits));
}

export async function setPin(db: FinanceDB, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('invalid_pin');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinHash = await hashPin(pin, salt);
  await db.settings.update(SETTINGS_ID, { pinHash, pinSalt: bytesToBase64(salt), updatedAt: nowIso() });
}

export async function clearPin(db: FinanceDB): Promise<void> {
  await db.settings.where('id').equals(SETTINGS_ID).modify((s) => {
    delete s.pinHash;
    delete s.pinSalt;
    s.updatedAt = nowIso();
  });
}

export async function verifyPin(pin: string, pinHash: string, pinSalt: string): Promise<boolean> {
  const candidate = await hashPin(pin, base64ToBytes(pinSalt));
  // Constant-time-ish comparison; timing is not a real threat here but it's free.
  let diff = candidate.length ^ pinHash.length;
  for (let i = 0; i < Math.min(candidate.length, pinHash.length); i++) diff |= candidate.charCodeAt(i) ^ pinHash.charCodeAt(i);
  return diff === 0;
}

/** Should the app lock when it comes back to the foreground? */
export function shouldLock(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= LOCK_AFTER_MS;
}
