import 'express-async-errors';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { existsSync } from 'fs';
import { getPool, ensureSchema } from './shared/db';

import authRouter      from './routes/auth';
import catalogRouter   from './routes/catalog';
import crmRouter       from './routes/crm';
import meRouter        from './routes/me';
import proposalsRouter from './routes/proposals';
import rateCardsRouter from './routes/rateCards';
import seedRouter      from './routes/seed';
import settingsRouter  from './routes/settings';
import templatesRouter from './routes/templates';
import usersRouter     from './routes/users';
import lookupsRouter   from './routes/lookups';

const app  = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const DIST = path.resolve(__dirname, '../../dist');

// ─── Security & parsing ───────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: false, // SPA handles its own CSP
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? true,
  credentials: true,
}));
app.use(express.json({ limit: '20mb' })); // large for avatar + vendor quote attachments
app.use(express.urlencoded({ extended: true }));

// ─── API routes ───────────────────────────────────────────────────────────────

app.use('/api/auth',       authRouter);
app.use('/api/catalog',    catalogRouter);
app.use('/api/crm',        crmRouter);
app.use('/api/me',         meRouter);
app.use('/api/proposals',  proposalsRouter);
app.use('/api/rate-cards', rateCardsRouter);
app.use('/api/seed',       seedRouter);
app.use('/api/settings',   settingsRouter);
app.use('/api/templates',  templatesRouter);
app.use('/api/users',      usersRouter);
app.use('/api/lookups',    lookupsRouter);

// ─── Frontend static files ────────────────────────────────────────────────────

if (existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '1h' }));
  // SPA fallback — anything that isn't /api/* serves index.html
  app.get(/^(?!\/api).*$/, (_req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  console.warn(`[warn] Frontend dist not found at ${DIST}. Run 'npm run build' in the project root.`);
}

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  // Connect and run schema migrations
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    console.log('[db] PostgreSQL connected');
    await ensureSchema();
    console.log('[db] Schema up to date');
  } catch (e) {
    console.error('[db] Cannot connect to PostgreSQL:', e);
    if (process.env.DATABASE_URL) {
      process.exit(1);
    }
    console.warn('[db] DATABASE_URL not set — running in dev mode without database');
  }

  app.listen(PORT, () => {
    console.log(`[server] ITRM PreSales listening on port ${PORT}`);
  });
}

start().catch(e => { console.error(e); process.exit(1); });
