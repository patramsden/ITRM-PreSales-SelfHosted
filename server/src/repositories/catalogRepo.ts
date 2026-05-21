import { query } from '../shared/db';
import type { CatalogItem } from '../types/index';

function parseRelatedIds(raw: unknown): string[] {
  if (!raw || typeof raw !== 'string' || raw === '[]') return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

function toCatalogItem(r: Record<string, unknown>): CatalogItem {
  return {
    id: r.id as string, sku: r.sku as string, description: r.description as string,
    category: (r.category as string) ?? '', defaultVendor: (r.default_vendor as string) ?? undefined,
    costPrice: Number(r.cost_price ?? 0),
    listPrice: Number(r.list_price),
    partType: ((r.part_type as string) ?? 'Hardware') as CatalogItem['partType'],
    relatedIds: parseRelatedIds(r.related_ids),
  };
}

export async function getAllCatalogItems(): Promise<CatalogItem[]> {
  return (await query('SELECT * FROM catalog_items ORDER BY description')).map(toCatalogItem);
}

export async function createCatalogItem(item: CatalogItem): Promise<void> {
  await query(
    `INSERT INTO catalog_items (id,sku,description,category,default_vendor,cost_price,list_price,part_type,related_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [item.id, item.sku, item.description, item.category ?? null, item.defaultVendor ?? null,
     item.costPrice ?? 0, item.listPrice, item.partType ?? 'Hardware', JSON.stringify(item.relatedIds ?? [])],
  );
}

export async function updateCatalogItem(id: string, item: CatalogItem): Promise<void> {
  await query(
    `UPDATE catalog_items SET sku=$2,description=$3,category=$4,default_vendor=$5,
       cost_price=$6,list_price=$7,part_type=$8,related_ids=$9 WHERE id=$1`,
    [id, item.sku, item.description, item.category ?? null, item.defaultVendor ?? null,
     item.costPrice ?? 0, item.listPrice, item.partType ?? 'Hardware', JSON.stringify(item.relatedIds ?? [])],
  );
}

export async function deleteCatalogItem(id: string): Promise<void> {
  const all = await getAllCatalogItems();
  for (const c of all.filter(c => c.id !== id && (c.relatedIds ?? []).includes(id))) {
    await updateCatalogItem(c.id, { ...c, relatedIds: (c.relatedIds ?? []).filter(r => r !== id) });
  }
  await query('DELETE FROM catalog_items WHERE id=$1', [id]);
}
