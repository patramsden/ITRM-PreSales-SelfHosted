import { Router } from 'express';
import { requireAuth, requireAdmin } from '../shared/auth';
import { getAllTemplates, createTemplate, updateTemplate, deleteTemplate } from '../repositories/templateRepo';

const router = Router();

router.get('/',       requireAuth,               async (_req, res) => { res.json(await getAllTemplates()); });
router.post('/',      requireAuth, requireAdmin, async (req,  res) => { await createTemplate(req.body); res.status(201).json(req.body); });
router.put('/:id',    requireAuth, requireAdmin, async (req,  res) => { await updateTemplate(req.params.id, req.body); res.json(req.body); });
router.delete('/:id', requireAuth, requireAdmin, async (req,  res) => { await deleteTemplate(req.params.id); res.sendStatus(204); });

export default router;
