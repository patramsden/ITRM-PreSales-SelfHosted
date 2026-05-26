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

router.post('/service-key',   requireAuth, requireAdmin, async (_req, res) => {
  const newKey = randomBytes(32).toString('hex');
  await updateAppSettings({ 'system.serviceApiKey': newKey });
  res.json({ serviceApiKey: newKey });
});
router.delete('/service-key', requireAuth, requireAdmin, async (_req, res) => {
  await updateAppSettings({ 'system.serviceApiKey': '' });
  res.sendStatus(204);
});
router.get('/service-key/status', requireAuth, requireAdmin, async (_req, res) => {
  const cfg = await getAppSettingsDirect();
  res.json({ configured: (cfg['system.serviceApiKey'] ?? '').trim().length > 0 });
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
