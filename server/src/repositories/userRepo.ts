import { v4 as uuid } from 'uuid';
import { query } from '../shared/db';
import type { User } from '../types/index';

function toUser(r: Record<string, unknown>): User {
  return {
    id:           r.id as string,
    name:         r.name as string,
    email:        r.email as string,
    department:   (r.department as string) ?? undefined,
    jobTitle:     (r.job_title as string) ?? undefined,
    avatar:       (r.avatar_data as string) ?? undefined,
    appRole:      ((r.app_role as string) ?? 'user') as User['appRole'],
    authProvider: ((r.auth_provider as string) ?? 'local') as User['authProvider'],
    samlNameId:   (r.saml_name_id as string) ?? undefined,
    isActive:     r.is_active !== false,  // treat NULL as active for backward compat
  };
}

export async function getAllUsers(): Promise<(User & { totpEnabled: boolean })[]> {
  const rows = await query(
    'SELECT id,name,email,department,job_title,avatar_data,app_role,auth_provider,totp_secret FROM users ORDER BY name',
  );
  return rows.map(r => ({ ...toUser(r), totpEnabled: !!(r.totp_secret as string) }));
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await query(
    'SELECT id,name,email,department,job_title,avatar_data,app_role,auth_provider FROM users WHERE id=$1',
    [id],
  );
  return rows.length ? toUser(rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<{
  user: User; passwordHash: string | null; totpSecret: string | null;
} | null> {
  const rows = await query('SELECT * FROM users WHERE email=$1 AND is_active IS NOT FALSE', [email]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    user:         toUser(r),
    passwordHash: (r.password_hash as string) ?? null,
    totpSecret:   (r.totp_secret   as string) ?? null,
  };
}

export async function getUserBySamlNameId(nameId: string): Promise<User | null> {
  const rows = await query(
    'SELECT id,name,email,department,app_role,auth_provider FROM users WHERE saml_name_id=$1 AND is_active IS NOT FALSE',
    [nameId],
  );
  return rows.length ? toUser(rows[0]) : null;
}

export async function upsertUser(u: User, passwordHash?: string): Promise<User> {
  await query(
    `INSERT INTO users (id,name,email,department,app_role,auth_provider,password_hash,saml_name_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET
       name          = EXCLUDED.name,
       email         = EXCLUDED.email,
       department    = EXCLUDED.department,
       app_role      = EXCLUDED.app_role,
       auth_provider = EXCLUDED.auth_provider,
       password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
       saml_name_id  = COALESCE(EXCLUDED.saml_name_id,  users.saml_name_id)`,
    [u.id, u.name, u.email, u.department ?? null, u.appRole ?? 'user',
     u.authProvider ?? 'local', passwordHash ?? null, u.samlNameId ?? null],
  );
  return u;
}

export async function updateOwnProfile(
  id: string,
  updates: { name?: string; department?: string; jobTitle?: string; avatar?: string | null },
): Promise<User | null> {
  await query(
    `UPDATE users SET
       name        = COALESCE($2, name),
       department  = COALESCE($3, department),
       job_title   = $4,
       avatar_data = COALESCE($5, avatar_data)
     WHERE id = $1`,
    [id, updates.name ?? null, updates.department ?? null, updates.jobTitle ?? null, updates.avatar ?? null],
  );
  return getUserById(id);
}

export async function clearUserAvatar(id: string): Promise<void> {
  await query('UPDATE users SET avatar_data = NULL WHERE id=$1', [id]);
}

export async function updateUserRole(id: string, appRole: User['appRole']): Promise<void> {
  await query('UPDATE users SET app_role=$2 WHERE id=$1', [id, appRole]);
}

export async function updateUserPassword(id: string, passwordHash: string): Promise<void> {
  await query('UPDATE users SET password_hash=$2 WHERE id=$1', [id, passwordHash]);
}

export async function setUserTotpSecret(id: string, secret: string | null): Promise<void> {
  await query('UPDATE users SET totp_secret=$2 WHERE id=$1', [id, secret]);
}

export async function getUserTotpSecret(id: string): Promise<string | null> {
  const rows = await query<{ totp_secret: string | null }>('SELECT totp_secret FROM users WHERE id=$1', [id]);
  return rows.length ? rows[0].totp_secret : null;
}

export async function createTotpChallenge(userId: string): Promise<string> {
  const token = uuid();
  const exp   = new Date(Date.now() + 5 * 60 * 1000);
  await query('INSERT INTO totp_challenges (token,user_id,expires_at) VALUES ($1,$2,$3)', [token, userId, exp]);
  return token;
}

export async function consumeTotpChallenge(token: string): Promise<string | null> {
  const rows = await query<{ user_id: string }>(
    'SELECT user_id FROM totp_challenges WHERE token=$1 AND expires_at > NOW()',
    [token],
  );
  if (!rows.length) return null;
  await query('DELETE FROM totp_challenges WHERE token=$1', [token]);
  return rows[0].user_id;
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = uuid();
  const exp   = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await query('INSERT INTO password_reset_tokens (token,user_id,expires_at) VALUES ($1,$2,$3)', [token, userId, exp]);
  return token;
}

export async function consumePasswordResetToken(token: string): Promise<string | null> {
  const rows = await query<{ user_id: string }>(
    'SELECT user_id FROM password_reset_tokens WHERE token=$1 AND expires_at > NOW() AND used=FALSE',
    [token],
  );
  if (!rows.length) return null;
  await query('UPDATE password_reset_tokens SET used=TRUE WHERE token=$1', [token]);
  return rows[0].user_id;
}

export async function deleteUser(id: string): Promise<void> {
  await query('DELETE FROM users WHERE id=$1', [id]);
}

/** Includes inactive users — used by SCIM to locate deprovisioned accounts. */
export async function getUserByEmailAll(email: string): Promise<User | null> {
  const rows = await query('SELECT * FROM users WHERE email=$1', [email]);
  return rows.length ? toUser(rows[0]) : null;
}

export async function setUserActive(id: string, active: boolean): Promise<void> {
  await query('UPDATE users SET is_active=$2 WHERE id=$1', [id, active]);
}

export async function updateUserFromScim(id: string, updates: { name?: string; isActive?: boolean }): Promise<void> {
  if (updates.name !== undefined) {
    await query('UPDATE users SET name=$2 WHERE id=$1', [id, updates.name]);
  }
  if (updates.isActive !== undefined) {
    await query('UPDATE users SET is_active=$2 WHERE id=$1', [id, updates.isActive]);
  }
}
