import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAuth } from '../shared/auth';
import { listComments, createComment, deleteComment } from '../repositories/commentRepo';

const router = Router();

// GET /api/proposals/:id/comments
router.get('/:id/comments', requireAuth, async (req, res) => {
  try {
    const comments = await listComments(req.params.id);
    res.json(comments);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/proposals/:id/comments
router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const user = (req as unknown as { user: { id: string; name: string } }).user;
    const { content } = req.body as { content?: string };
    if (!content?.trim()) { res.status(400).json({ error: 'content required' }); return; }
    const comment = await createComment({
      id: uuid(),
      proposalId: req.params.id,
      authorId: user.id,
      authorName: user.name,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(comment);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// This router is also mounted at /api/comments for the DELETE endpoint
// mounted from index.ts as app.use('/api/comments', commentsRouter)
router.delete('/delete/:id', requireAuth, async (req, res) => {
  try {
    const user = (req as unknown as { user: { id: string; appRole: string } }).user;
    const ok = await deleteComment(req.params.id, user.id, user.appRole === 'admin');
    if (!ok) { res.status(403).json({ error: 'Not found or not authorised' }); return; }
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
