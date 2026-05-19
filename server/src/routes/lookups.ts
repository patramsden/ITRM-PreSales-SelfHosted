import { Router } from 'express';
import { requireAuth, requireAdmin } from '../shared/auth';
import { getLookups, updateLookups } from '../repositories/lookupRepo';

const router = Router();

router.get('/',   requireAuth,               async (_req, res) => { res.json(await getLookups()); });
router.put('/',   requireAuth, requireAdmin, async (req,  res) => { res.json(await updateLookups(req.body)); });

export default router;
