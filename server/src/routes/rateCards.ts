import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireAdmin } from '../shared/auth';
import { getAllRateCards, createRateCard, updateRateCard, deleteRateCard } from '../repositories/rateCardRepo';
import type { RateCard } from '../types/index';

const router = Router();

router.get('/',       requireAuth,                 async (_req, res) => { res.json(await getAllRateCards()); });
router.post('/',      requireAuth, requireAdmin,   async (req,  res) => { await createRateCard(req.body); res.status(201).json(req.body); });
router.put('/:id',    requireAuth, requireAdmin,   async (req,  res) => { await updateRateCard(req.params.id, req.body); res.json(req.body); });
router.delete('/:id', requireAuth, requireAdmin,   async (req,  res) => { await deleteRateCard(req.params.id); res.sendStatus(204); });

// ─── POST /api/rate-cards/import — bulk upsert (match by role name) ───────────

router.post('/import', requireAuth, requireAdmin, async (req, res) => {
  try {
    const cards = req.body as Partial<RateCard>[];
    if (!Array.isArray(cards)) { res.status(400).json({ error: 'Expected array' }); return; }

    const existing = await getAllRateCards();
    const byRole   = new Map(existing.map(r => [r.role.toLowerCase(), r]));
    let imported   = 0;

    for (const c of cards) {
      if (!c.role?.trim()) continue;
      const card: RateCard = {
        id:              byRole.get(c.role.toLowerCase())?.id ?? uuid(),
        role:            c.role.trim(),
        costRate:        Number(c.costRate  ?? 0),
        sellRate:        Number(c.sellRate  ?? 0),
        currency:        (c.currency as RateCard['currency']) ?? 'GBP',
        effectiveFrom:   c.effectiveFrom ?? new Date().toISOString().split('T')[0],
        effectiveTo:     c.effectiveTo   || undefined,
        overtimeEnabled: String(c.overtimeEnabled).toLowerCase() === 'true',
      };
      if (byRole.has(c.role.toLowerCase())) {
        await updateRateCard(card.id, card);
      } else {
        await createRateCard(card);
      }
      imported++;
    }

    res.json({ imported });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Import failed' });
  }
});

export default router;
