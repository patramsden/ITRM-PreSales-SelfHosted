import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireCatalogEdit } from '../shared/auth';
import { getAllCatalogItems, createCatalogItem, updateCatalogItem, deleteCatalogItem } from '../repositories/catalogRepo';
import type { CatalogItem } from '../types/index';

const router = Router();

router.get('/',       requireAuth,               async (_req, res) => { res.json(await getAllCatalogItems()); });
router.post('/',      requireAuth, requireCatalogEdit, async (req,  res) => { await createCatalogItem(req.body); res.status(201).json(req.body); });
router.put('/:id',    requireAuth, requireCatalogEdit, async (req,  res) => { await updateCatalogItem(req.params.id, req.body); res.json(req.body); });
router.delete('/:id', requireAuth, requireCatalogEdit, async (req,  res) => { await deleteCatalogItem(req.params.id); res.sendStatus(204); });

// POST /api/catalog/import — bulk upsert matched by SKU (if non-empty) then description
router.post('/import', requireAuth, requireCatalogEdit, async (req, res) => {
  try {
    const incoming = req.body as Partial<CatalogItem>[];
    if (!Array.isArray(incoming)) { res.status(400).json({ error: 'Expected array' }); return; }

    const existing   = await getAllCatalogItems();
    const bySku      = new Map(existing.filter(c => c.sku).map(c => [c.sku.toLowerCase(), c]));
    const byDesc     = new Map(existing.map(c => [c.description.toLowerCase(), c]));
    let imported     = 0;

    for (const item of incoming) {
      if (!item.description?.trim()) continue;

      const match =
        (item.sku?.trim() ? bySku.get(item.sku.trim().toLowerCase()) : undefined) ??
        byDesc.get(item.description.trim().toLowerCase());

      const catalogItem: CatalogItem = {
        id:            match?.id ?? uuid(),
        sku:           item.sku?.trim() ?? '',
        description:   item.description.trim(),
        category:      item.category?.trim() ?? '',
        defaultVendor: item.defaultVendor?.trim() || undefined,
        costPrice:     Number(item.costPrice  ?? 0),
        listPrice:     Number(item.listPrice  ?? 0),
        partType:      (item.partType as CatalogItem['partType']) ?? 'Hardware',
        relatedIds:    item.relatedIds ?? [],
      };

      if (match) {
        await updateCatalogItem(catalogItem.id, catalogItem);
      } else {
        await createCatalogItem(catalogItem);
      }
      imported++;
    }

    res.json({ imported });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Import failed' });
  }
});

export default router;
