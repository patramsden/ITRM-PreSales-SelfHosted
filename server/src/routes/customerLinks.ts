import { Router } from 'express';
import { requireAuth } from '../shared/auth';
import { createCustomerLink, listCustomerLinks } from '../repositories/customerLinkRepo';

const router = Router({ mergeParams: true });

// POST /api/proposals/:id/customer-link
router.post('/:id/customer-link', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { expiresAt, defaultTheme } = req.body as { expiresAt?: string; defaultTheme?: 'light' | 'dark' };
    const token = await createCustomerLink(req.params.id, user?.name ?? 'system', expiresAt, defaultTheme ?? 'light');
    res.json({ token, url: `/customer/${token}` });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/proposals/:id/customer-links
router.get('/:id/customer-links', requireAuth, async (req, res) => {
  try {
    res.json(await listCustomerLinks(req.params.id));
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
