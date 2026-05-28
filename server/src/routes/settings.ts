import { Router } from 'express';
import { randomBytes } from 'crypto';
import { requireAuth, requireAdmin } from '../shared/auth';
import { getAppSettings, updateAppSettings, getAppSettingsDirect } from '../repositories/settingsRepo';

const router = Router();

// GET is intentionally public — getAppSettings() already strips all secret/sensitive
// keys and replaces them with a *.configured boolean. This endpoint must be reachable
// before login so BrandingContext can load the logo, colours and company name on the
// login page. Write operations still require admin auth.
router.get('/', async (_req, res) => { res.json(await getAppSettings()); });
router.put('/',  requireAuth, requireAdmin, async (req,  res) => {
  await updateAppSettings(req.body as Record<string, string>);
  res.json(await getAppSettings());
});

// ─── Named API keys ────────────────────────────────────────────────────────────

interface StoredApiKey { id: string; label: string; keyHash: string; createdAt: string; lastUsed?: string; }

async function readApiKeys(): Promise<StoredApiKey[]> {
  const cfg = await getAppSettingsDirect();
  const raw = (cfg['system.serviceApiKeys'] ?? '').trim();
  if (!raw || raw === '[]') return [];
  try { return JSON.parse(raw) as StoredApiKey[]; }
  catch { return []; }
}
async function writeApiKeys(keys: StoredApiKey[]): Promise<void> {
  await updateAppSettings({ 'system.serviceApiKeys': JSON.stringify(keys) });
}

router.get('/api-keys', requireAuth, requireAdmin, async (_req, res) => {
  const keys = await readApiKeys();
  res.json(keys.map(({ id, label, createdAt, lastUsed }) => ({ id, label, createdAt, lastUsed })));
});

router.post('/api-keys', requireAuth, requireAdmin, async (req, res) => {
  const { label } = req.body as { label?: string };
  if (!label?.trim()) { res.status(400).json({ error: 'label is required' }); return; }
  const { hashToken } = await import('../shared/crypto');
  const rawKey    = randomBytes(32).toString('hex');
  const keyHash   = await hashToken(rawKey);
  const id        = randomBytes(6).toString('hex');
  const createdAt = new Date().toISOString();
  const keys      = await readApiKeys();
  keys.push({ id, label: label.trim(), keyHash, createdAt });
  await writeApiKeys(keys);
  res.json({ id, label: label.trim(), createdAt, key: rawKey });
});

router.delete('/api-keys/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const keys = await readApiKeys();
  const next = keys.filter(k => k.id !== id);
  if (next.length === keys.length) { res.status(404).json({ error: 'Key not found' }); return; }
  await writeApiKeys(next);
  res.sendStatus(204);
});

// ─── Legacy single-key endpoints (kept for backward compatibility) ─────────────

router.post('/service-key', requireAuth, requireAdmin, async (_req, res) => {
  const newKey = randomBytes(32).toString('hex');
  await updateAppSettings({ 'system.serviceApiKey': newKey });
  res.json({ serviceApiKey: newKey });
});
router.delete('/service-key', requireAuth, requireAdmin, async (_req, res) => {
  await updateAppSettings({ 'system.serviceApiKey': '' });
  res.sendStatus(204);
});
router.get('/service-key/status', requireAuth, requireAdmin, async (_req, res) => {
  const cfg    = await getAppSettingsDirect();
  const legacy = (cfg['system.serviceApiKey'] ?? '').trim();
  const named  = await readApiKeys();
  res.json({ configured: legacy.length > 0 || named.length > 0 });
});

// Test email — sends to the logged-in admin's own address
router.post('/test-email', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { sendEmail, emailWrapper } = await import('../shared/email');
    const toAddr = req.user?.email ?? 'test@example.com';
    await sendEmail({
      to:          toAddr,
      subject:     'MSP SalesPro — Email test',
      html:        emailWrapper('Email Test', '<p>Your email configuration is working correctly. This message was sent using the configured provider.</p>'),
      senderEmail: toAddr,
    });
    res.json({ success: true, message: `Test email sent to ${toAddr}` });
  } catch (e) {
    res.json({ success: false, message: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
