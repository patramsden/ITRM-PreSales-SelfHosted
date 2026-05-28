import type { Request, Response, NextFunction } from 'express';
import { validateSession } from '../repositories/sessionRepo';
import { getAppSettingsDirect } from '../repositories/settingsRepo';
import { verifyToken } from './crypto';
import type { User } from '../types/index';

// ─── Type augmentation ────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_SECRET  = process.env.SESSION_SECRET;
const DATABASE_URL    = process.env.DATABASE_URL;

// Guard: if a database is configured but SESSION_SECRET is missing, refuse to start.
if (DATABASE_URL && !SESSION_SECRET) {
  throw new Error(
    '[SECURITY] DATABASE_URL is set but SESSION_SECRET is not. ' +
    'All authentication would be bypassed. Set SESSION_SECRET to a strong random ' +
    'string (minimum 32 characters) in your .env file before starting the server.',
  );
}

const DEV_BYPASS = !SESSION_SECRET;

const SERVICE_ACCOUNT: User = {
  id: 'service-account', name: 'Service Account',
  email: 'service@system', appRole: 'admin', authProvider: 'local',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function checkServiceKey(token: string): Promise<boolean> {
  try {
    const cfg = await getAppSettingsDirect();

    // New: named multi-key list (JSON array encrypted at rest)
    const keysJson = (cfg['system.serviceApiKeys'] ?? '').trim();
    if (keysJson && keysJson !== '[]') {
      try {
        const keys = JSON.parse(keysJson) as Array<{ id: string; keyHash: string }>;
        for (const k of keys) {
          if (k.keyHash && await verifyToken(token, k.keyHash)) return true;
        }
      } catch { /* malformed JSON — fall through */ }
    }

    // Legacy: single key stored as a bcrypt hash
    const legacy = (cfg['system.serviceApiKey'] ?? '').trim();
    if (legacy && await verifyToken(token, legacy)) return true;

    return false;
  } catch { return false; }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (DEV_BYPASS) {
    req.user = { id: 'dev', name: 'Dev User', email: 'dev@local', appRole: 'admin', authProvider: 'local' };
    return next();
  }
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const user = await validateSession(token);
    if (user) { req.user = user; return next(); }
    if (await checkServiceKey(token)) { req.user = SERVICE_ACCOUNT; return next(); }
  } catch { /* fall through */ }

  res.status(401).json({ error: 'Unauthorized' });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.appRole !== 'admin') {
    res.status(403).json({ error: 'Forbidden — admin access required' });
    return;
  }
  next();
}

export function requirePresales(req: Request, res: Response, next: NextFunction): void {
  const allowed = ['admin', 'sales_admin', 'presales'];
  if (!req.user || !allowed.includes(req.user.appRole)) {
    res.status(403).json({ error: 'Pre-sales access required' });
    return;
  }
  next();
}

export function requireCatalogEdit(req: Request, res: Response, next: NextFunction): void {
  const allowed = ['admin', 'sales_admin'];
  if (!req.user || !allowed.includes(req.user.appRole)) {
    res.status(403).json({ error: 'Sales Admin or Admin access required' });
    return;
  }
  next();
}

/** Retrieves the authenticated user without failing the request (used by /me). */
export async function getSessionUser(req: Request): Promise<User | null> {
  if (DEV_BYPASS) {
    return { id: 'dev', name: 'Dev User', email: 'dev@local', appRole: 'admin', authProvider: 'local' };
  }
  const token = extractToken(req);
  if (!token) return null;
  try {
    const user = await validateSession(token);
    if (user) return user;
    if (await checkServiceKey(token)) return SERVICE_ACCOUNT;
  } catch { /* ignore */ }
  return null;
}
