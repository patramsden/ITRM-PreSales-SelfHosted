import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, requireAdmin } from '../shared/auth';
import {
  getAllUsers, getUserById, upsertUser, deleteUser, updateUserPassword,
  setUserTotpSecret, createPasswordResetToken,
} from '../repositories/userRepo';
import { getAppSettingsDirect, SETTING_KEYS } from '../repositories/settingsRepo';
import { buildPolicy, validatePassword } from '../shared/passwordPolicy';
import type { User } from '../types/index';

const router = Router();

router.get('/',       requireAuth,               async (_req, res) => { res.json(await getAllUsers()); });
router.get('/:id',    requireAuth,               async (req,  res) => {
  const u = await getUserById(req.params.id);
  u ? res.json(u) : res.sendStatus(404);
});
router.post('/',      requireAuth, requireAdmin, async (req,  res) => {
  const body = req.body as User & { password?: string };
  if (!body?.id || !body?.name) { res.status(400).json({ error: 'id and name are required' }); return; }
  const hash = body.password ? await bcrypt.hash(body.password, 10) : undefined;
  const { password: _pw, ...userData } = body;
  res.status(201).json(await upsertUser(userData as User, hash));
});
router.put('/:id',    requireAuth, requireAdmin, async (req,  res) => {
  const body = req.body as User & { newPassword?: string };
  const { newPassword, ...userData } = body;
  const user = await upsertUser({ ...userData as User, id: req.params.id });
  if (newPassword) await updateUserPassword(req.params.id, await bcrypt.hash(newPassword, 10));
  res.json(user);
});
router.delete('/:id', requireAuth, requireAdmin, async (req,  res) => {
  await deleteUser(req.params.id); res.sendStatus(204);
});

// Admin — generate password reset link
router.post('/:id/password-reset', requireAuth, requireAdmin, async (req, res) => {
  const user = await getUserById(req.params.id);
  if (!user) { res.sendStatus(404); return; }
  if (user.authProvider !== 'local') { res.status(400).json({ error: 'Password reset only applies to local accounts' }); return; }
  const token  = await createPasswordResetToken(req.params.id);
  const cfg    = await getAppSettingsDirect().catch(() => ({} as Record<string, string>));
  const appUrl = cfg[SETTING_KEYS.APP_URL] || process.env.APP_URL || '';
  res.json({ resetUrl: `${appUrl}/reset-password?token=${token}` });
});

// Admin — clear TOTP
router.delete('/:id/totp', requireAuth, requireAdmin, async (req, res) => {
  await setUserTotpSecret(req.params.id, null); res.sendStatus(204);
});

// Admin — set password directly
router.post('/:id/set-password', requireAuth, requireAdmin, async (req, res) => {
  const { password } = req.body ?? {};
  if (!password) { res.status(400).json({ error: 'password is required' }); return; }
  const cfg    = await getAppSettingsDirect().catch(() => ({} as Record<string, string>));
  const errors = validatePassword(password as string, buildPolicy(cfg));
  if (errors.length) { res.status(400).json({ error: 'Password does not meet policy', details: errors }); return; }
  await updateUserPassword(req.params.id, await bcrypt.hash(password as string, 12));
  res.sendStatus(204);
});

export default router;
