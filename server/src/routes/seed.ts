import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ensureSchema } from '../shared/db';
import { upsertUser } from '../repositories/userRepo';
import { createRateCard } from '../repositories/rateCardRepo';
import { createCatalogItem } from '../repositories/catalogRepo';
import { updateLookups } from '../repositories/lookupRepo';
import type { User, RateCard, CatalogItem } from '../types/index';

const SEED_SECRET = process.env.SEED_SECRET;

const SEED_USERS: User[] = [
  { id: 'u1', name: 'Pat Ramsden',  email: 'pat.ramsden@company.com',  department: 'PreSales',   appRole: 'admin', authProvider: 'local' },
  { id: 'u2', name: 'Sarah Chen',   email: 'sarah.chen@company.com',   department: 'PreSales',   appRole: 'user',  authProvider: 'local' },
  { id: 'u3', name: 'James Wright', email: 'james.wright@company.com', department: 'Sales',      appRole: 'user',  authProvider: 'local' },
  { id: 'u4', name: 'Priya Patel',  email: 'priya.patel@company.com',  department: 'PreSales',   appRole: 'user',  authProvider: 'local' },
  { id: 'u5', name: 'Tom Nguyen',   email: 'tom.nguyen@company.com',   department: 'Management', appRole: 'admin', authProvider: 'local' },
];

const SEED_RATE_CARDS: RateCard[] = [
  { id: 'r1', role: 'Cloud Architect',            costRate: 980, sellRate: 1400, currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r2', role: 'Network Architect',          costRate: 840, sellRate: 1200, currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r3', role: 'Senior Network Engineer',    costRate: 665, sellRate: 950,  currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r4', role: 'Network Engineer',           costRate: 525, sellRate: 750,  currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r5', role: 'Security Consultant',        costRate: 910, sellRate: 1300, currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r6', role: 'Project Manager',            costRate: 700, sellRate: 1000, currency: 'GBP', effectiveFrom: '2026-01-01' },
];

const SEED_CATALOG: CatalogItem[] = [
  { id: 'c1', sku: 'C9300-48P-A',     description: 'Cisco Catalyst 9300 48P PoE+',         category: 'Switching', defaultVendor: 'Cisco',     listPrice: 11200 },
  { id: 'c2', sku: 'FPR2140-NGFW-K9', description: 'Cisco Firepower 2140 NGFW',            category: 'Security',  defaultVendor: 'Cisco',     listPrice: 28500 },
  { id: 'c3', sku: 'AAA-10624',       description: 'Microsoft 365 Business Premium (p/u/yr)', category: 'Software', defaultVendor: 'Microsoft', listPrice: 22, partType: 'Annual' },
  { id: 'c4', sku: 'VNX-2000',        description: 'Veeam Backup & Replication',           category: 'Software',  defaultVendor: 'Veeam',     listPrice: 1850 },
];

const router = Router();

router.post('/', async (req, res) => {
  if (!SEED_SECRET || req.headers['x-seed-secret'] !== SEED_SECRET) {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }
  await ensureSchema();
  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD ?? 'Presales@2026!';
  const hashedPassword  = await bcrypt.hash(defaultPassword, 10);
  const counts = { users: 0, rateCards: 0, catalog: 0, lookups: 0 };
  for (const u of SEED_USERS)      { await upsertUser(u, hashedPassword); counts.users++; }
  for (const r of SEED_RATE_CARDS) { await createRateCard(r).catch(() => {}); counts.rateCards++; }
  for (const c of SEED_CATALOG)    { await createCatalogItem(c).catch(() => {}); counts.catalog++; }
  await updateLookups({
    catalogCategories: ['Compute','Licensing','Networking','Security','Software','Storage','Switching'],
    departments:       ['Engineering','Finance','Management','Marketing','Operations','PreSales','Sales'],
  });
  counts.lookups = 2;
  res.json({ message: 'Seed complete', counts });
});

export default router;
