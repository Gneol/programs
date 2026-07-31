import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Encryption constants ──
const STATIC_PHRASE = "gneol-token-store-internal-2024";
const ENCRYPTION_KEY = crypto.createHash('sha256').update(STATIC_PHRASE).digest(); // 32 bytes
const ALGORITHM = 'aes-256-cbc';

// ── Storage file ──
const STORAGE_DIR = path.join(os.homedir(), '.gneol');
const STORAGE_FILE = path.join(STORAGE_DIR, 'tokens.bin');

function ensureDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 });
  }
}

function encrypt(plaintext: string): Buffer {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  // Prepend IV for storage
  return Buffer.concat([iv, encrypted]);
}

function decrypt(data: Buffer): string {
  const iv = data.subarray(0, 16);
  const ciphertext = data.subarray(16);
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

function readStore(): Record<string, string> {
  if (!fs.existsSync(STORAGE_FILE)) return {};
  const raw = fs.readFileSync(STORAGE_FILE);
  if (raw.length === 0) return {};
  try {
    const json = decrypt(raw);
    return JSON.parse(json);
  } catch {
    // Corrupted or invalid – start fresh
    return {};
  }
}

function writeStore(store: Record<string, string>): void {
  ensureDir();
  const json = JSON.stringify(store);
  const encrypted = encrypt(json);
  fs.writeFileSync(STORAGE_FILE, encrypted, { mode: 0o600 });
}

// ── Public API ──

/** Store a token (API key) encrypted on disk. */
export function storeToken(key: string, value: string): void {
  const store = readStore();
  store[key] = value;
  writeStore(store);
}

/** Retrieve a stored token, or null if not found. */
export function getToken(key: string): string | null {
  const store = readStore();
  console.log(store)
  return store[key] ?? null;
}

/** Remove a stored token. Returns true if existed. */
export function removeToken(key: string): boolean {
  const store = readStore();
  if (!(key in store)) return false;
  delete store[key];
  writeStore(store);
  return true;
}

/** List all stored token keys (for management). */
export function listTokens(): string[] {
  return Object.keys(readStore());
}
