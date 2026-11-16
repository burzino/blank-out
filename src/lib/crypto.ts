// Cifratura dei backup: PBKDF2-SHA256 → AES-GCM 256. Tutto con Web Crypto, nessuna dipendenza.
// La chiave derivata resta sul dispositivo come CryptoKey non estraibile (il JS non può leggerne i byte).
import { openDB, type IDBPDatabase } from 'idb';

export const KDF_ITERATIONS = 250_000;
export const MIN_PASSWORD = 6;

export interface EncryptedFile {
  app: 'blank-out';
  enc: 1;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string; // base64
  iv: string; // base64
  data: string; // base64 del ciphertext (con tag GCM)
  createdAt: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Password non corretta');
    this.name = 'WrongPasswordError';
  }
}

// ---- base64 ----
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export const newSalt = () => randomBytes(16);

export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // non estraibile
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson(obj: unknown, key: CryptoKey, salt: Uint8Array): Promise<EncryptedFile> {
  const iv = randomBytes(12); // IV nuovo a ogni cifratura: mai riusare con la stessa chiave
  const plain = new TextEncoder().encode(JSON.stringify(obj));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return {
    app: 'blank-out',
    enc: 1,
    kdf: 'PBKDF2-SHA256',
    iter: KDF_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(cipher),
    createdAt: new Date().toISOString()
  };
}

export function isEncryptedFile(x: unknown): x is EncryptedFile {
  const f = x as EncryptedFile;
  return !!f && typeof f === 'object' && f.app === 'blank-out' && f.enc === 1 && f.kdf === 'PBKDF2-SHA256' &&
    typeof f.salt === 'string' && typeof f.iv === 'string' && typeof f.data === 'string';
}

// Decifra con una chiave già pronta. AES-GCM verifica l'integrità: chiave sbagliata → OperationError.
export async function decryptWithKey<T = unknown>(file: EncryptedFile, key: CryptoKey): Promise<T> {
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(file.iv) }, key, fromBase64(file.data));
  } catch {
    throw new WrongPasswordError();
  }
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

// Rideriva la chiave dal salt (e dalle iterazioni) scritti nel file.
export async function decryptJson<T = unknown>(file: EncryptedFile, password: string): Promise<{ value: T; key: CryptoKey; salt: Uint8Array<ArrayBuffer> }> {
  if (!isEncryptedFile(file)) throw new Error('File di backup non valido');
  const salt = fromBase64(file.salt);
  const key = await deriveKey(password, salt, file.iter || KDF_ITERATIONS);
  return { value: await decryptWithKey<T>(file, key), key, salt };
}

// ---- Chiave locale (database separato dai dati del diario) ----
interface StoredKey {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
  createdAt: string;
}

let kdb: Promise<IDBPDatabase> | null = null;
function keysDb() {
  kdb ??= openDB('blank-out-keys', 1, {
    upgrade(d) {
      d.createObjectStore('keys');
    }
  });
  return kdb;
}

export async function saveLocalKey(key: CryptoKey, salt: Uint8Array<ArrayBuffer>) {
  const v: StoredKey = { key, salt, createdAt: new Date().toISOString() };
  await (await keysDb()).put('keys', v, 'backup');
}

export async function loadLocalKey(): Promise<StoredKey | null> {
  try {
    const v = (await (await keysDb()).get('keys', 'backup')) as StoredKey | undefined;
    return v?.key ? v : null;
  } catch {
    return null;
  }
}

export async function clearLocalKey() {
  try {
    await (await keysDb()).delete('keys', 'backup');
  } catch {}
}
