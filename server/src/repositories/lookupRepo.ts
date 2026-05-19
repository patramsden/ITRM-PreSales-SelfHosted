import { query } from '../shared/db';
import type { AppLookups } from '../types/index';

const DEFAULTS: AppLookups = {
  catalogCategories: ['Compute','Licensing','Networking','Security','Software','Storage','Switching'],
  departments:       ['Engineering','Finance','Management','Marketing','Operations','PreSales','Sales'],
};

export async function getLookups(): Promise<AppLookups> {
  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM lookups');
  const result = { ...DEFAULTS };
  for (const row of rows) {
    if (row.key in result) (result as Record<string, unknown>)[row.key] = JSON.parse(row.value);
  }
  return result;
}

export async function updateLookups(lookups: AppLookups): Promise<AppLookups> {
  for (const key of Object.keys(lookups) as (keyof AppLookups)[]) {
    await query(
      `INSERT INTO lookups (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(lookups[key])],
    );
  }
  return lookups;
}
