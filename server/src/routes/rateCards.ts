import { Router } from 'express';
import { requireAuth, requireAdmin } from '../shared/auth';
import { getAllRateCards, createRateCard, updateRateCard, deleteRateCard } from '../repositories/rateCardRepo';

const router = Router();

router.get('/',       requireAuth,                 async (_req, res) => { res.json(await getAllRateCards()); });
router.post('/',      requireAuth, requireAdmin,   async (req,  res) => { await createRateCard(req.body); res.status(201).json(req.body); });
router.put('/:id',    requireAuth, requireAdmin,   async (req,  res) => { await updateRateCard(req.params.id, req.body); res.json(req.body); });
router.delete('/:id', requireAuth, requireAdmin,   async (req,  res) => { await deleteRateCard(req.params.id); res.sendStatus(204); });

export default router;
