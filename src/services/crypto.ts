/**
 * Optional backup encryption (SPEC 12): WebCrypto AES-GCM with a PBKDF2-derived key.
 * Everything runs locally; nothing leaves the device.
 */

export const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedEnvelope {
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  ciphertext: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(plaintext: string, password: string): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(new Uint8Array(ct)),
  };
}

export class WrongPasswordError extends Error {
  constructor() {
    super('wrong password or corrupted file');
    this.name = 'WrongPasswordError';
  }
}

export async function decryptText(envelope: EncryptedEnvelope, password: string): Promise<string> {
  const key = await deriveKey(password, base64ToBytes(envelope.kdf.salt), envelope.kdf.iterations);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.cipher.iv) },
      key,
      base64ToBytes(envelope.ciphertext),
    );
    return new TextDecoder().decode(pt);
  } catch {
    // AES-GCM authentication failure: wrong password or tampered file.
    throw new WrongPasswordError();
  }
}
