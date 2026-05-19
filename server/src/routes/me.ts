import { Router } from 'express';
import { getSessionUser } from '../shared/auth';
import { updateOwnProfile, clearUserAvatar } from '../repositories/userRepo';

const router = Router();

router.get('/', async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) { res.sendStatus(204); return; }
  res.json(user);
});

router.put('/', async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const body = req.body as {
    name?: string; department?: string; jobTitle?: string;
    avatar?: string | null; clearAvatar?: boolean;
  };
  if (body.avatar && body.avatar.length > 3_000_000) {
    res.status(400).json({ error: 'Avatar image is too large (max ~2 MB)' }); return;
  }
  if (body.clearAvatar) await clearUserAvatar(user.id);
  const updated = await updateOwnProfile(user.id, {
    name: body.name, department: body.department, jobTitle: body.jobTitle,
    avatar: body.clearAvatar ? null : body.avatar,
  });
  res.json(updated);
});

export default router;
