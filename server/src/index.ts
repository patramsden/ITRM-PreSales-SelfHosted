import 'express-async-errors';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { existsSync } from 'fs';
import { getPool, ensureSchema } from './shared/db';
import { refreshCertsFromMetadata } from './shared/samlMetadata';
import { getAppSettingsDirect, SETTING_KEYS } from './repositories/settingsRepo';

import authRouter      from './routes/auth';
import catalogRouter   from './routes/catalog';
import crmRouter       from './routes/crm';
import scimRouter      from './routes/scim';
import reportRouter    from './routes/report';
import meRouter        from './routes/me';
import proposalsRouter from './routes/proposals';
import rateCardsRouter from './routes/rateCards';
import seedRouter      from './routes/seed';
import settingsRouter  from './routes/settings';
import templatesRouter from './routes/templates';
import usersRouter     from './routes/users';
import lookupsRouter   from './routes/lookups';
import sharesRouter        from './routes/shares';
import publicShareRouter   from './routes/publicShare';
import versionsRouter      from './routes/versions';
import sowRouter           from './routes/sow';
import customerLinksRouter from './routes/customerLinks';
import publicCustomerRouter from './routes/publicCustomer';

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
// Parse JSON bodies — also accept application/scim+json (used by Entra ID SCIM provisioning)
app.use(express.json({ limit: '20mb', type: ['application/json', 'application/scim+json'] }));
app.use(express.urlencoded({ extended: true }));

// ─── API routes ───────────────────────────────────────────────────────────────

app.use('/api/auth',       authRouter);
app.use('/api/catalog',    catalogRouter);
app.use('/api/crm',        crmRouter);
app.use('/api/scim/v2',   scimRouter);
app.use('/api/report',    reportRouter);
app.use('/api/me',         meRouter);
app.use('/api/proposals',  proposalsRouter);
app.use('/api/proposals',  versionsRouter);   // /api/proposals/:id/versions/*
app.use('/api/proposals',  sharesRouter);     // /api/proposals/:id/share(s)
app.use('/api/share',      publicShareRouter); // /api/share/:token  (public GET + authed DELETE)
app.use('/api/rate-cards', rateCardsRouter);
app.use('/api/seed',       seedRouter);
app.use('/api/settings',   settingsRouter);
app.use('/api/sow',          sowRouter);
app.use('/api/proposals',    customerLinksRouter);  // /:id/customer-link(s)
app.use('/api/customer',     publicCustomerRouter); // /:token and /:token/sign
app.use('/api/customer-link', publicCustomerRouter); // DELETE /:token
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

  // ─── Daily SAML metadata refresh ───────────────────────────────────────────
  // Run once at startup (in case server was down for >24 h), then every 24 h.
  async function tryRefreshSamlCert() {
    try {
      const cfg = await getAppSettingsDirect();
      const metadataUrl = (cfg[SETTING_KEYS.SSO_METADATA_URL] ?? '').trim();
      if (!metadataUrl) return;
      const lastRefreshed = Number(cfg[SETTING_KEYS.SSO_CERT_REFRESHED] ?? '0');
      if (Date.now() - lastRefreshed < 23 * 60 * 60 * 1000) return; // < 23 h, skip
      const { certs } = await refreshCertsFromMetadata(metadataUrl);
      console.log(`[saml] Metadata refreshed — ${certs.length} cert(s) cached`);
    } catch (e) {
      console.warn('[saml] Scheduled metadata refresh failed:', e instanceof Error ? e.message : e);
    }
  }
  setTimeout(tryRefreshSamlCert, 5_000);                    // 5 s after startup
  setInterval(tryRefreshSamlCert, 24 * 60 * 60 * 1000);    // then every 24 h
}

start().catch(e => { console.error(e); process.exit(1); });
