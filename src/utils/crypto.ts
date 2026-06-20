/**
 * AES-256-GCM encryption/decryption using Web Crypto API (SubtleCrypto).
 * Compatible with Chrome extension Service Workers.
 *
 * Encrypted format stored in Gist:
 *   { __encrypted__: true, salt: <hex>, iv: <hex>, data: <hex> }
 */

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256; // AES-256

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function unhex(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) bytes[i / 2] = parseInt(s.slice(i, i + 2), 16);
  return bytes;
}

function enc(t: string): Uint8Array {
  return new TextEncoder().encode(t);
}

function dec(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedPayload {
  __encrypted__: true;
  salt: string;
  iv: string;
  data: string;
}

export async function encrypt(plaintext: string, password: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc(plaintext));
  return { __encrypted__: true, salt: hex(salt), iv: hex(iv), data: hex(encrypted) };
}

export async function decrypt(payload: EncryptedPayload, password: string): Promise<string> {
  const salt = unhex(payload.salt);
  const iv = unhex(payload.iv);
  const data = unhex(payload.data);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return dec(new Uint8Array(plain));
}

/** Check if a raw string is an encrypted payload */
export function isEncrypted(raw: string): boolean {
  try {
    const obj = JSON.parse(raw);
    return obj?.__encrypted__ === true;
  } catch { return false; }
}

/** Encrypt JSON string for upload, returns the string to store */
export async function encryptContent(jsonStr: string, password: string): Promise<string> {
  if (!password) return jsonStr;
  const encrypted = await encrypt(jsonStr, password);
  return JSON.stringify(encrypted);
}

/** Decrypt downloaded content, returns the original JSON string */
export async function decryptContent(raw: string, password: string): Promise<string> {
  if (!isEncrypted(raw)) return raw;
  const encrypted: EncryptedPayload = JSON.parse(raw);
  return decrypt(encrypted, password);
}
