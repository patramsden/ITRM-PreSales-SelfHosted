import { v4 as uuid } from 'uuid';
import { query } from '../shared/db';
import { getUserById } from './userRepo';
import { getAppSettingsDirect, SETTING_KEYS } from './settingsRepo';
import type { User } from '../types/index';

const DEFAULT_TTL_HOURS = 8;
const CODE_TTL_MINUTES  = 5;

// ─── TTL cache — re-read from DB at most once per minute ─────────────────────

let _ttlMs   = DEFAULT_TTL_HOURS * 3_600_000;
let _ttlTill = 0;

async function getSessionTtlMs(): Promise<number> {
  if (Date.now() < _ttlTill) return _ttlMs;
  try {
    const cfg   = await getAppSettingsDirect();
    const hours = parseFloat(cfg[SETTING_KEYS.SESSION_TIMEOUT_HOURS] ?? '') || DEFAULT_TTL_HOURS;
    _ttlMs   = Math.max(0.25, hours) * 3_600_000; // minimum 15 min
    _ttlTill = Date.now() + 60_000;
  } catch { /* use cached value */ }
  return _ttlMs;
}

export async function createSession(userId: string): Promise<string> {
  const ttl     = await getSessionTtlMs();
  const token   = uuid();
  const expires = new Date(Date.now() + ttl);
  await query('INSERT INTO sessions (token,user_id,expires_at) VALUES ($1,$2,$3)', [token, userId, expires]);
  return token;
}

/**
 * Validate a session AND extend its expiry (sliding inactivity window).
 * The UPDATE + RETURNING is a single round-trip; if the session has expired
 * or doesn't exist the UPDATE matches no rows and we return null.
 */
export async function validateSession(token: string): Promise<User | null> {
  const ttl  = await getSessionTtlMs();
  const rows = await query<{ user_id: string }>(
    `UPDATE sessions SET expires_at = $2
     WHERE token = $1 AND expires_at > NOW()
     RETURNING user_id`,
    [token, new Date(Date.now() + ttl)],
  );
  if (!rows.length) return null;
  return getUserById(rows[0].user_id);
}

export async function deleteSession(token: string): Promise<void> {
  await query('DELETE FROM sessions WHERE token=$1', [token]);
}

export async function createAuthCode(userId: string): Promise<string> {
  const code    = uuid();
  const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);
  await query('INSERT INTO auth_codes (code,user_id,expires_at) VALUES ($1,$2,$3)', [code, userId, expires]);
  return code;
}

export async function exchangeAuthCode(code: string): Promise<string | null> {
  const rows = await query<{ user_id: string }>(
    `WITH deleted AS (
       DELETE FROM auth_codes WHERE code=$1 AND expires_at > NOW() RETURNING user_id
     ) SELECT user_id FROM deleted`,
    [code],
  );
  if (!rows.length) return null;
  return createSession(rows[0].user_id);
}
