import { query, getPool } from '../shared/db';

export interface BackupData {
  version: '2.0';
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

const TABLE_ORDER = [
  'app_settings', 'users', 'catalog_items', 'rate_cards',
  'templates', 'template_parts', 'template_phases', 'template_tasks',
  'proposals', 'parts', 'vendor_quotes', 'phases', 'tasks',
  'customer_links',
];

export async function exportBackup(): Promise<BackupData> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of TABLE_ORDER) {
    try {
      tables[table] = await query(`SELECT * FROM ${table} ORDER BY 1`);
    } catch {
      tables[table] = [];
    }
  }
  return { version: '2.0', exportedAt: new Date().toISOString(), tables };
}

export async function restoreBackup(backup: BackupData): Promise<Record<string, number>> {
  if (backup.version !== '2.0') throw new Error('Unsupported backup version. Expected 2.0');
  const counts: Record<string, number> = {};
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Delete in reverse FK order
    for (const table of [...TABLE_ORDER].reverse()) {
      try { await client.query(`DELETE FROM ${table}`); } catch { /* table may not exist */ }
    }
    // Insert in FK order
    for (const table of TABLE_ORDER) {
      const rows = backup.tables[table] ?? [];
      let inserted = 0;
      for (const row of rows) {
        const cols = Object.keys(row);
        if (!cols.length) continue;
        const vals = cols.map((_, i) => `$${i + 1}`);
        await client.query(
          `INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT DO NOTHING`,
          cols.map(c => row[c]),
        );
        inserted++;
      }
      counts[table] = inserted;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return counts;
}
