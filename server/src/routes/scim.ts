/**
 * SCIM 2.0 endpoint for Entra ID (Azure AD) user provisioning.
 *
 * Supports: Users resource (list, get, create, replace, patch, delete).
 * Authentication: Bearer token set in Settings → Provisioning.
 *
 * Entra ID setup:
 *   1. Enterprise Application → Provisioning → Automatic
 *   2. Tenant URL: https://<your-app>/api/scim/v2
 *   3. Secret Token: the token generated in Settings → Provisioning
 */
import { Router, type Request, type Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getAppSettingsDirect } from '../repositories/settingsRepo';
import {
  getAllUsers, getUserById, getUserByEmailAll,
  upsertUser, setUserActive, updateUserFromScim,
} from '../repositories/userRepo';
import type { User } from '../types/index';

const router = Router();

// ─── Auth middleware ──────────────────────────────────────────────────────────

async function scimAuth(req: Request, res: Response): Promise<boolean> {
  const s     = await getAppSettingsDirect();
  const token = (s['scim.token'] ?? '').trim();
  if (!token) { res.status(503).json(scimError(503, 'SCIM provisioning is not configured.')); return false; }
  if (req.headers.authorization !== `Bearer ${token}`) {
    res.status(401).json(scimError(401, 'Invalid or missing Bearer token.')); return false;
  }
  return true;
}

// ─── SCIM helpers ─────────────────────────────────────────────────────────────

function scimError(status: number, detail: string) {
  return { schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: String(status), detail };
}

function toScimUser(u: User, baseUrl: string) {
  const nameParts = u.name.trim().split(/\s+/);
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: u.id,
    userName: u.email,
    name: {
      formatted:  u.name,
      givenName:  nameParts[0] ?? '',
      familyName: nameParts.slice(1).join(' ') || (nameParts[0] ?? ''),
    },
    displayName: u.name,
    emails: [{ value: u.email, primary: true, type: 'work' }],
    active: u.isActive !== false,
    meta: { resourceType: 'User', location: `${baseUrl}/Users/${u.id}` },
  };
}

function scimListResponse(users: User[], baseUrl: string) {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: users.length,
    startIndex: 1,
    itemsPerPage: users.length,
    Resources: users.map(u => toScimUser(u, baseUrl)),
  };
}

function baseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}/api/scim/v2`;
}

// ─── Service Provider Config (discovery) ─────────────────────────────────────

router.get('/ServiceProviderConfig', (_req, res) => {
  res.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch:     { supported: true },
    bulk:      { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter:    { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort:      { supported: false },
    etag:      { supported: false },
    authenticationSchemes: [{ type: 'oauthbearertoken', name: 'OAuth Bearer Token', description: 'Authentication scheme using OAuth Bearer token' }],
  });
});

// ─── GET /scim/v2/Users ───────────────────────────────────────────────────────

router.get('/Users', async (req, res) => {
  if (!await scimAuth(req, res)) return;
  try {
    const filter = (req.query.filter as string ?? '').trim();
    const base   = baseUrl(req);

    // Entra sends: userName eq "email" or externalId eq "objectId"
    const emailMatch = filter.match(/userName\s+eq\s+"([^"]+)"/i);
    if (emailMatch) {
      const user = await getUserByEmailAll(emailMatch[1]);
      return void res.json(scimListResponse(user ? [user] : [], base));
    }

    const all = await getAllUsers();
    res.json(scimListResponse(all as User[], base));
  } catch (e) { res.status(500).json(scimError(500, String(e))); }
});

// ─── GET /scim/v2/Users/:id ───────────────────────────────────────────────────

router.get('/Users/:id', async (req, res) => {
  if (!await scimAuth(req, res)) return;
  try {
    const user = await getUserById(req.params.id);
    if (!user) { res.status(404).json(scimError(404, 'User not found')); return; }
    res.json(toScimUser(user, baseUrl(req)));
  } catch (e) { res.status(500).json(scimError(500, String(e))); }
});

// ─── POST /scim/v2/Users ─────────────────────────────────────────────────────

router.post('/Users', async (req, res) => {
  if (!await scimAuth(req, res)) return;
  try {
    const body     = req.body as Record<string, unknown>;
    const email    = (body.userName as string ?? '').toLowerCase().trim();
    const given    = ((body.name as Record<string, string>)?.givenName   ?? '').trim();
    const family   = ((body.name as Record<string, string>)?.familyName  ?? '').trim();
    const display  = (body.displayName as string ?? `${given} ${family}`).trim();
    const active   = body.active !== false;

    if (!email) { res.status(400).json(scimError(400, 'userName (email) is required')); return; }

    // Check if user already exists
    const existing = await getUserByEmailAll(email);
    if (existing) {
      await setUserActive(existing.id, active);
      res.status(200).json(toScimUser({ ...existing, isActive: active }, baseUrl(req)));
      return;
    }

    const user: User = {
      id:           uuid(),
      name:         display || email,
      email,
      appRole:      'user',
      authProvider: 'saml',
      isActive:     active,
    };
    await upsertUser(user);
    res.status(201).json(toScimUser(user, baseUrl(req)));
  } catch (e) { res.status(500).json(scimError(500, String(e))); }
});

// ─── PUT /scim/v2/Users/:id ───────────────────────────────────────────────────

router.put('/Users/:id', async (req, res) => {
  if (!await scimAuth(req, res)) return;
  try {
    const user = await getUserById(req.params.id);
    if (!user) { res.status(404).json(scimError(404, 'User not found')); return; }

    const body    = req.body as Record<string, unknown>;
    const given   = ((body.name as Record<string, string>)?.givenName  ?? '').trim();
    const family  = ((body.name as Record<string, string>)?.familyName ?? '').trim();
    const display = (body.displayName as string ?? `${given} ${family}`).trim();
    const active  = body.active !== false;

    await updateUserFromScim(req.params.id, { name: display || user.name, isActive: active });
    res.json(toScimUser({ ...user, name: display || user.name, isActive: active }, baseUrl(req)));
  } catch (e) { res.status(500).json(scimError(500, String(e))); }
});

// ─── PATCH /scim/v2/Users/:id ─────────────────────────────────────────────────

router.patch('/Users/:id', async (req, res) => {
  if (!await scimAuth(req, res)) return;
  try {
    const user = await getUserById(req.params.id);
    if (!user) { res.status(404).json(scimError(404, 'User not found')); return; }

    const ops = ((req.body as Record<string, unknown>).Operations ?? []) as Array<{
      op: string; path?: string; value: unknown;
    }>;

    let updatedName:   string | undefined;
    let updatedActive: boolean | undefined;

    for (const op of ops) {
      const operation = op.op.toLowerCase();
      const path      = (op.path ?? '').toLowerCase();

      if (path === 'active' && (operation === 'replace' || operation === 'add')) {
        updatedActive = op.value === true || op.value === 'true';
      }
      if ((path === 'displayname' || path === 'name.formatted') && operation === 'replace') {
        updatedName = String(op.value);
      }
      // Handle object-style patch (no path, value is an object)
      if (!op.path && typeof op.value === 'object' && op.value !== null) {
        const v = op.value as Record<string, unknown>;
        if ('active' in v) updatedActive = v.active === true || v.active === 'true';
        if ('displayName' in v) updatedName = String(v.displayName);
      }
    }

    await updateUserFromScim(req.params.id, { name: updatedName, isActive: updatedActive });
    res.json(toScimUser({
      ...user,
      name:     updatedName     ?? user.name,
      isActive: updatedActive   ?? user.isActive,
    }, baseUrl(req)));
  } catch (e) { res.status(500).json(scimError(500, String(e))); }
});

// ─── DELETE /scim/v2/Users/:id ────────────────────────────────────────────────

router.delete('/Users/:id', async (req, res) => {
  if (!await scimAuth(req, res)) return;
  try {
    const user = await getUserById(req.params.id);
    if (!user) { res.status(404).json(scimError(404, 'User not found')); return; }
    // Soft-delete: deactivate rather than delete so audit trail is preserved
    await setUserActive(req.params.id, false);
    res.status(204).send();
  } catch (e) { res.status(500).json(scimError(500, String(e))); }
});

export default router;
