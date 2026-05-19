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

export default router;
