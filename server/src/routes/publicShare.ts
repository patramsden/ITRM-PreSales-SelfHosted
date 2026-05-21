import { Router } from 'express';
import { requireAuth } from '../shared/auth';
import { deleteShare, getProposalByShareToken } from '../repositories/shareRepo';

const router = Router();

// GET /api/share/:token  — public, no auth required
router.get('/:token', async (req, res) => {
  try {
    const proposal = await getProposalByShareToken(req.params.token);
    if (!proposal) { res.status(404).json({ error: 'Share link not found or expired' }); return; }
    res.json(proposal);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// DELETE /api/share/:token  — requires auth
router.delete('/:token', requireAuth, async (req, res) => {
  try {
    await deleteShare(req.params.token);
    res.status(204).send();
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
