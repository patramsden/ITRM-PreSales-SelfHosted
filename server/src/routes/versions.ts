import { Router } from 'express';
import { requireAuth } from '../shared/auth';
import { listVersions, getVersionSnapshot } from '../repositories/versionRepo';
import { updateProposal } from '../repositories/proposalRepo';
import type { Proposal } from '../types/index';

const router = Router({ mergeParams: true });

// GET /api/proposals/:id/versions
router.get('/:id/versions', requireAuth, async (req, res) => {
  try {
    res.json(await listVersions(req.params.id));
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/proposals/:id/versions/:vid
router.get('/:id/versions/:vid', requireAuth, async (req, res) => {
  try {
    const snapshot = await getVersionSnapshot(req.params.vid);
    if (!snapshot) { res.status(404).json({ error: 'Version not found' }); return; }
    res.json(JSON.parse(snapshot) as Proposal);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/proposals/:id/versions/:vid/restore
router.post('/:id/versions/:vid/restore', requireAuth, async (req, res) => {
  try {
    const snapshot = await getVersionSnapshot(req.params.vid);
    if (!snapshot) { res.status(404).json({ error: 'Version not found' }); return; }
    const proposal = JSON.parse(snapshot) as Proposal;
    await updateProposal(req.params.id, proposal);
    res.json(proposal);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
