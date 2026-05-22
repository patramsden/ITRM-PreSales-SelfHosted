import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAuth } from '../shared/auth';
import { getAllClauses, createClause, updateClause, deleteClause } from '../repositories/clauseRepo';
import type { Clause } from '../types/index';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  try { res.json(await getAllClauses()); }
  catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const user = (req as unknown as { user: { name: string } }).user;
    const { title, category, content } = req.body as Partial<Clause>;
    if (!title?.trim() || !content?.trim()) { res.status(400).json({ error: 'title and content required' }); return; }
    const clause = await createClause({ id: uuid(), title: title.trim(), category: category?.trim() || 'General', content: content.trim(), createdBy: user.name, createdAt: new Date().toISOString() });
    res.status(201).json(clause);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const body = req.body as Partial<Clause>;
    if (!body.title?.trim() || !body.content?.trim()) { res.status(400).json({ error: 'title and content required' }); return; }
    const updated = await updateClause(req.params.id, { ...body, id: req.params.id } as Clause);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try { await deleteClause(req.params.id); res.status(204).end(); }
  catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
