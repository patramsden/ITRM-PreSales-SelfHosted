import { Router } from 'express';
import { requireAuth } from '../shared/auth';
import { query } from '../shared/db';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

function requireLogsAccess(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.appRole ?? '';
  if (!['admin', 'sales_admin'].includes(role)) {
    res.status(403).json({ error: 'Admin or Sales Admin access required' }); return;
  }
  next();
}

router.get('/', requireAuth, requireLogsAccess, async (req, res) => {
  const level    = (req.query.level    as string) || null;
  const category = (req.query.category as string) || null;
  const search   = (req.query.search   as string) || null;
  const limit    = Math.min(parseInt((req.query.limit as string) ?? '200'), 500);

  const params: unknown[] = [limit];
  let where = 'WHERE 1=1';
  if (level)    { params.push(level);             where += ` AND level = $${params.length}`; }
  if (category) { params.push(category);          where += ` AND category = $${params.length}`; }
  if (search)   { params.push(`%${search}%`);     where += ` AND message ILIKE $${params.length}`; }

  const rows = await query<Record<string, unknown>>(
    `SELECT id, created_at, level, category, message, details, user_id, user_name
     FROM system_logs ${where} ORDER BY created_at DESC LIMIT $1`, params,
  );

  const countRows = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM system_logs ${where}`, params.slice(1),
  );

  res.json({
    logs: rows.map(r => ({
      id: r.id, createdAt: (r.created_at as Date).toISOString(),
      level: r.level, category: r.category, message: r.message,
      details: r.details ?? undefined,
      userId: r.user_id ?? undefined, userName: r.user_name ?? undefined,
    })),
    total: parseInt(countRows[0]?.n ?? '0'),
  });
});

router.delete('/', requireAuth, requireLogsAccess, async (_req, res) => {
  await query('DELETE FROM system_logs', []);
  res.sendStatus(204);
});

export default router;
