import { Router } from 'express';
import { requireAuth, requireAdmin } from '../shared/auth';
import { exportBackup, restoreBackup, type BackupData } from '../repositories/backupRepo';

const router = Router();

// GET /api/backup — download full backup
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const backup = await exportBackup();
    const filename = `itrm-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(backup);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/backup/restore — restore from uploaded JSON
router.post('/restore', requireAuth, requireAdmin, async (req, res) => {
  try {
    const backup = req.body as BackupData;
    if (!backup?.version || !backup?.tables) {
      res.status(400).json({ error: 'Invalid backup file format' }); return;
    }
    const restored = await restoreBackup(backup);
    res.json({ success: true, restored });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
