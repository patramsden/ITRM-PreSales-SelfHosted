import { v4 as uuid } from 'uuid';
import { query } from '../shared/db';
import { getUserById } from './userRepo';
import type { User } from '../types/index';

const SESSION_TTL_HOURS = 8;
const CODE_TTL_MINUTES  = 5;

export async function createSession(userId: string): Promise<string> {
  const token   = uuid();
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3_600_000);
  await query('INSERT INTO sessions (token,user_id,expires_at) VALUES ($1,$2,$3)', [token, userId, expires]);
  return token;
}

export async function validateSession(token: string): Promise<User | null> {
  const rows = await query<{ user_id: string }>(
    'SELECT user_id FROM sessions WHERE token=$1 AND expires_at > NOW()',
    [token],
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
  // Use a CTE to atomically delete and return the user_id
  const rows = await query<{ user_id: string }>(
    `WITH deleted AS (
       DELETE FROM auth_codes WHERE code=$1 AND expires_at > NOW() RETURNING user_id
     ) SELECT user_id FROM deleted`,
    [code],
  );
  if (!rows.length) return null;
  return createSession(rows[0].user_id);
}
