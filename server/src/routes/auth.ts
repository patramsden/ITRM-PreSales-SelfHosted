import { Router } from 'express';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { SAML } from '@node-saml/node-saml';
import { v4 as uuid } from 'uuid';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateSecret: totpGenerateSecret, generateURI: totpGenerateURI, verify: totpVerify } = require('otplib') as {
  generateSecret: (len?: number) => string;
  generateURI: (opts: { issuer: string; label: string; secret: string }) => string;
  verify: (opts: { secret: string; token: string }) => Promise<boolean>;
};
import { requireAuth, requireAdmin } from '../shared/auth';
import { ensureFreshCert, splitCerts, refreshCertsFromMetadata } from '../shared/samlMetadata';
import { buildPolicy, validatePassword } from '../shared/passwordPolicy';
import {
  getUserByEmail, getUserBySamlNameId, upsertUser, updateUserPassword,
  getUserTotpSecret, setUserTotpSecret,
  createTotpChallenge, consumeTotpChallenge,
  createPasswordResetToken, consumePasswordResetToken,
} from '../repositories/userRepo';
import { createSession, deleteSession, exchangeAuthCode, createAuthCode, validateSession } from '../repositories/sessionRepo';
import { getAppSettingsDirect, SETTING_KEYS } from '../repositories/settingsRepo';
import type { User } from '../types/index';

const router = Router();

async function buildSamlInstance() {
  let cfg: Record<string, string> = {};
  try { cfg = await getAppSettingsDirect(); } catch { /* dev */ }
  const entryPoint = cfg[SETTING_KEYS.SSO_ENTRY_POINT] || process.env.SAML_ENTRY_POINT;
  const issuer     = cfg[SETTING_KEYS.SSO_ISSUER]       || process.env.SAML_ISSUER;
  const appUrl     = cfg[SETTING_KEYS.APP_URL]           || process.env.APP_URL;

  // Cert — auto-refresh from metadata URL if configured and stale, else fall back to manual paste
  const certRaw = await ensureFreshCert(cfg).catch(() => cfg[SETTING_KEYS.SSO_IDP_CERT]?.trim());
  const cert    = certRaw || process.env.SAML_IDP_CERT;

  if (!entryPoint || !issuer || !cert || !appUrl) return null;
  return new SAML({
    callbackUrl: `${appUrl}/api/auth/saml/callback`,
    entryPoint, issuer,
    idpCert: splitCerts(cert),   // supports single cert or array for key rotation
    wantAssertionsSigned: false,
  });
}

// GET /api/auth/saml/cert-info — admin: cert thumbprint for diagnostics
router.get('/saml/cert-info', requireAuth, requireAdmin, async (_req, res) => {
  const cfg         = await getAppSettingsDirect();
  const certRaw     = (cfg[SETTING_KEYS.SSO_IDP_CERT]    ?? '').trim();
  const metadataUrl = (cfg[SETTING_KEYS.SSO_METADATA_URL] ?? '').trim();
  const lastRefresh = cfg[SETTING_KEYS.SSO_CERT_REFRESHED] ?? '';

  if (!certRaw) { res.json({ configured: false, metadataUrl: !!metadataUrl }); return; }

  const { createHash } = await import('crypto');
  const certs = certRaw.split('\n').map((s: string) => s.trim()).filter(Boolean);
  const thumbprints = certs.map((c: string) => {
    const der = Buffer.from(c, 'base64');
    return createHash('sha1').update(der).digest('hex').toUpperCase()
             .match(/.{2}/g)!.join(':');
  });

  res.json({
    configured:    true,
    certsCount:    certs.length,
    thumbprints,
    metadataUrl:   !!metadataUrl,
    lastRefreshed: lastRefresh ? new Date(Number(lastRefresh)).toISOString() : null,
  });
});

// GET /api/auth/config — public: tells the login page whether SSO is on
router.get('/config', async (_req, res) => {
  const cfg = await getAppSettingsDirect().catch(() => ({} as Record<string, string>));
  res.json({ ssoEnabled: cfg[SETTING_KEYS.SSO_ENABLED] === 'true' });
});

// POST /api/auth/lookup
router.post('/lookup', async (req, res) => {
  const email = ((req.body?.email as string) ?? '').trim().toLowerCase();
  if (!email) { res.status(400).json({ error: 'email is required' }); return; }
  const record = await getUserByEmail(email);
  if (record) { res.json({ method: record.user.authProvider }); return; }
  const cfg = await getAppSettingsDirect().catch(() => ({} as Record<string, string>));
  res.json({ method: cfg[SETTING_KEYS.SSO_ENABLED] === 'true' ? 'saml' : 'local' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) { res.status(400).json({ error: 'email and password are required' }); return; }
  const record = await getUserByEmail(email);
  if (!record?.passwordHash) { res.status(401).json({ error: 'Invalid email or password' }); return; }
  const match = await bcrypt.compare(password as string, record.passwordHash);
  if (!match) { res.status(401).json({ error: 'Invalid email or password' }); return; }
  if (record.totpSecret) {
    const challengeToken = await createTotpChallenge(record.user.id);
    res.json({ requireTotp: true, challengeToken }); return;
  }
  const token = await createSession(record.user.id);
  res.json({ token, user: record.user });
});

// POST /api/auth/totp/login
router.post('/totp/login', async (req, res) => {
  const { challengeToken, code } = req.body ?? {};
  if (!challengeToken || !code) { res.status(400).json({ error: 'challengeToken and code are required' }); return; }
  const userId = await consumeTotpChallenge(challengeToken as string);
  if (!userId) { res.status(401).json({ error: 'Invalid or expired challenge. Please sign in again.' }); return; }
  const secret = await getUserTotpSecret(userId);
  if (!secret) { res.status(401).json({ error: 'TOTP not configured for this account' }); return; }
  const valid = await totpVerify({ secret, token: (code as string).replace(/\s/g, '') });
  if (!valid) { res.status(401).json({ error: 'Invalid authenticator code' }); return; }
  const token       = await createSession(userId);
  const sessionUser = await validateSession(token);
  res.json({ token, user: sessionUser });
});

// POST /api/auth/totp/setup
router.post('/totp/setup', requireAuth, async (req, res) => {
  const user        = req.user!;
  const secret      = totpGenerateSecret();
  const otpauthUrl  = totpGenerateURI({ issuer: 'ITRM PreSales', label: user.email, secret });
  const qrCode      = await QRCode.toDataURL(otpauthUrl);
  res.json({ secret, formattedSecret: secret.match(/.{1,4}/g)?.join(' ') ?? secret, qrCode });
});

// POST /api/auth/totp/enable
router.post('/totp/enable', requireAuth, async (req, res) => {
  const { secret, code } = req.body ?? {};
  if (!secret || !code) { res.status(400).json({ error: 'secret and code are required' }); return; }
  const valid = await totpVerify({ secret: secret as string, token: (code as string).replace(/\s/g, '') });
  if (!valid) { res.status(400).json({ error: 'Invalid code — please try again' }); return; }
  await setUserTotpSecret(req.user!.id, secret as string);
  res.sendStatus(204);
});

// DELETE /api/auth/totp
router.delete('/totp', requireAuth, async (req, res) => {
  await setUserTotpSecret(req.user!.id, null);
  res.sendStatus(204);
});

// GET /api/auth/totp/status
router.get('/totp/status', requireAuth, async (req, res) => {
  const secret = await getUserTotpSecret(req.user!.id);
  res.json({ totpEnabled: !!secret });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) await deleteSession(header.slice(7));
  res.sendStatus(204);
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword are required' }); return;
  }
  const record = await getUserByEmail(req.user!.email);
  if (!record?.passwordHash) { res.status(400).json({ error: 'No password set for this account' }); return; }
  const match = await bcrypt.compare(currentPassword as string, record.passwordHash);
  if (!match) { res.status(401).json({ error: 'Current password is incorrect' }); return; }
  const cfg    = await getAppSettingsDirect().catch(() => ({} as Record<string, string>));
  const policy = buildPolicy(cfg);
  const errors = validatePassword(newPassword as string, policy);
  if (errors.length) { res.status(400).json({ error: 'Password does not meet policy', details: errors }); return; }
  await updateUserPassword(req.user!.id, await bcrypt.hash(newPassword as string, 12));
  res.sendStatus(204);
});

// POST /api/auth/password-reset/request
router.post('/password-reset/request', async (req, res) => {
  const { email } = req.body ?? {};
  if (!email) { res.status(400).json({ error: 'email is required' }); return; }
  const record = await getUserByEmail(email as string);
  if (!record || record.user.authProvider !== 'local') {
    res.json({ message: 'If an account exists, a reset link has been generated.' }); return;
  }
  const token    = await createPasswordResetToken(record.user.id);
  const cfg      = await getAppSettingsDirect().catch(() => ({} as Record<string, string>));
  const appUrl   = cfg[SETTING_KEYS.APP_URL] || process.env.APP_URL || '';
  res.json({ resetUrl: `${appUrl}/reset-password?token=${token}`, message: 'Reset link generated.' });
});

// POST /api/auth/password-reset/confirm
router.post('/password-reset/confirm', async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || !password) { res.status(400).json({ error: 'token and password are required' }); return; }
  const cfg    = await getAppSettingsDirect().catch(() => ({} as Record<string, string>));
  const errors = validatePassword(password as string, buildPolicy(cfg));
  if (errors.length) { res.status(400).json({ error: 'Password does not meet policy', details: errors }); return; }
  const userId = await consumePasswordResetToken(token as string);
  if (!userId) { res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' }); return; }
  await updateUserPassword(userId, await bcrypt.hash(password as string, 12));
  res.json({ message: 'Password updated. You can now sign in.' });
});

// GET /api/auth/saml/init
router.get('/saml/init', async (_req, res) => {
  const saml = await buildSamlInstance();
  if (!saml) { res.status(400).json({ error: 'SAML not configured' }); return; }
  res.json({ redirectUrl: await saml.getAuthorizeUrlAsync('', '', {}) });
});

// POST /api/auth/saml/callback
router.post('/saml/callback', async (req, res) => {
  const saml = await buildSamlInstance();
  if (!saml) { res.status(400).json({ error: 'SAML not configured' }); return; }
  const samlResponse = (req.body as Record<string, string>).SAMLResponse ?? '';
  const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
  if (!profile) { res.status(401).json({ error: 'Invalid SAML response' }); return; }
  const nameId = profile.nameID;
  const email  = (profile.email as string) || nameId;
  const name   = (profile.displayName as string) || nameId;
  let user = await getUserBySamlNameId(nameId);
  if (!user) {
    user = { id: uuid(), name, email, appRole: 'user', authProvider: 'saml', samlNameId: nameId } satisfies User;
    await upsertUser(user);
  }
  const code = await createAuthCode(user.id);
  res.set('Content-Type', 'text/html').send(
    `<!DOCTYPE html><html><body><script>window.location.href='/?saml_code=${encodeURIComponent(code)}';</script></body></html>`
  );
});

// POST /api/auth/saml/exchange
router.post('/saml/exchange', async (req, res) => {
  const { code } = req.body ?? {};
  if (!code) { res.status(400).json({ error: 'code is required' }); return; }
  const token = await exchangeAuthCode(code as string);
  if (!token) { res.status(401).json({ error: 'Invalid or expired code' }); return; }
  const user = await validateSession(token);
  if (!user)  { res.status(401).json({ error: 'Session creation failed' }); return; }
  res.json({ token, user });
});

// POST /api/auth/saml/refresh-metadata — admin: force metadata cert refresh
router.post('/saml/refresh-metadata', requireAuth, requireAdmin, async (req, res) => {
  const cfg         = await getAppSettingsDirect();
  const metadataUrl = (cfg[SETTING_KEYS.SSO_METADATA_URL] ?? '').trim();
  if (!metadataUrl) { res.status(400).json({ error: 'sso.metadataUrl is not configured' }); return; }
  const { certs, refreshedAt } = await refreshCertsFromMetadata(metadataUrl);
  res.json({ success: true, certsFound: certs.length, refreshedAt: new Date(refreshedAt).toISOString() });
});

export default router;
