import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

const ALGORITHM  = 'aes-256-gcm';
const ENC_PREFIX = 'enc:v1:';
const HASH_PREFIX = 'hash:v1:';

/** Get the 32-byte encryption key from ENCRYPTION_KEY env var (64 hex chars). */
function getKey(): Buffer | null {
  const k = (process.env.ENCRYPTION_KEY ?? '').trim();
  if (!k) return null;
  if (k.length !== 64) {
    console.warn('[crypto] ENCRYPTION_KEY must be 64 hex characters — encryption disabled');
    return null;
  }
  return Buffer.from(k, 'hex');
}

/**
 * Encrypt a string value with AES-256-GCM.
 * Returns the original value unchanged if ENCRYPTION_KEY is not set.
 * Already-encrypted values (enc:v1: prefix) are returned as-is.
 */
export function encrypt(value: string): string {
  if (!value || value.startsWith(ENC_PREFIX)) return value;
  const key = getKey();
  if (!key) return value; // no key configured — store plain text
  const iv        = randomBytes(12);
  const cipher    = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag       = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a value encrypted with encrypt().
 * Returns the original value if it is not encrypted (backward compat).
 */
export function decrypt(value: string): string {
  if (!value || !value.startsWith(ENC_PREFIX)) return value;
  try {
    const key  = getKey();
    if (!key) return value;
    const data = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
    const iv        = data.subarray(0, 12);
    const tag       = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher  = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
  } catch {
    return value; // decryption failed — return raw (backward compat)
  }
}

/** Hash a token with bcrypt (for serviceApiKey, scim.token). */
export async function hashToken(token: string): Promise<string> {
  return HASH_PREFIX + await bcrypt.hash(token, 12);
}

/** Verify a plain token against a bcrypt hash (supports both prefixed and legacy). */
export async function verifyToken(token: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  const hash = stored.startsWith(HASH_PREFIX) ? stored.slice(HASH_PREFIX.length) : stored;
  // If it doesn't look like a bcrypt hash, fall back to plain equality
  if (!hash.startsWith('$2')) return token === stored;
  return bcrypt.compare(token, hash);
}

/** True if ENCRYPTION_KEY is configured. */
export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}
