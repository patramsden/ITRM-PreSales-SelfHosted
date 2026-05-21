import { Router } from 'express';
import { requireAuth } from '../shared/auth';
import { createShare, listShares, deleteShare, getProposalByShareToken } from '../repositories/shareRepo';

const router = Router({ mergeParams: true });

// POST /api/proposals/:id/share  — create a share link
router.post('/:id/share', requireAuth, async (req, res) => {
  try {
    const { expiresAt } = req.body as { expiresAt?: string };
    const token = await createShare(req.params.id, 'system', expiresAt);
    res.json({ token, url: `/share/${token}` });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/proposals/:id/shares  — list share links
router.get('/:id/shares', requireAuth, async (req, res) => {
  try {
    res.json(await listShares(req.params.id));
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
