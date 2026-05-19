import { Router } from 'express';
import { requireAuth, requireAdmin } from '../shared/auth';
import { getAllCatalogItems, createCatalogItem, updateCatalogItem, deleteCatalogItem } from '../repositories/catalogRepo';

const router = Router();

router.get('/',     requireAuth,                        async (_req, res) => { res.json(await getAllCatalogItems()); });
router.post('/',    requireAuth, requireAdmin,          async (req,  res) => { await createCatalogItem(req.body); res.status(201).json(req.body); });
router.put('/:id',  requireAuth, requireAdmin,          async (req,  res) => { await updateCatalogItem(req.params.id, req.body); res.json(req.body); });
router.delete('/:id', requireAuth, requireAdmin,        async (req,  res) => { await deleteCatalogItem(req.params.id); res.sendStatus(204); });

// POST /api/catalog/import — bulk upsert
router.post('/import', requireAuth, requireAdmin, async (req, res) => {
  const items = req.body as Array<Record<string, unknown>>;
  if (!Array.isArray(items)) { res.status(400).json({ error: 'Expected array' }); return; }
  let imported = 0;
  for (const item of items) {
    await createCatalogItem(item as never).catch(() =>
      updateCatalogItem(item.id as string, item as never),
    );
    imported++;
  }
  res.json({ imported });
});

export default router;
