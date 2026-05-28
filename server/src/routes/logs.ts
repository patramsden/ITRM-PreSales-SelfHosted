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

  // Build filter WHERE using $1, $2 ... for the count query.
  // For the main query, shift every $N to $(N+1) so $1 stays free for LIMIT.
  const filterParams: unknown[] = [];
  let filterWhere = 'WHERE 1=1';
  if (level)    { filterParams.push(level);         filterWhere += ` AND level = $${filterParams.length}`; }
  if (category) { filterParams.push(category);      filterWhere += ` AND category = $${filterParams.length}`; }
  if (search)   { filterParams.push(`%${search}%`); filterWhere += ` AND message ILIKE $${filterParams.length}`; }

  // Shift $N → $(N+1) so LIMIT can occupy $1
  const mainWhere  = filterWhere.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + 1}`);
  const mainParams = [limit, ...filterParams];

  const rows = await query<Record<string, unknown>>(
    `SELECT id, created_at, level, category, message, details, user_id, user_name
     FROM system_logs ${mainWhere} ORDER BY created_at DESC LIMIT $1`, mainParams,
  );

  const countRows = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM system_logs ${filterWhere}`, filterParams,
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
