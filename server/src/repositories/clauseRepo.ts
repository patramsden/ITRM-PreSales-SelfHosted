import { query } from '../shared/db';
import type { Clause } from '../types/index';

function toClause(r: Record<string, unknown>): Clause {
  return {
    id:        r.id as string,
    title:     r.title as string,
    category:  r.category as string,
    content:   r.content as string,
    createdBy: r.created_by as string,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export async function getAllClauses(): Promise<Clause[]> {
  const rows = await query('SELECT * FROM clauses ORDER BY category, title');
  return rows.map(toClause);
}

export async function createClause(c: Clause): Promise<Clause> {
  await query(
    'INSERT INTO clauses (id,title,category,content,created_by) VALUES ($1,$2,$3,$4,$5)',
    [c.id, c.title, c.category, c.content, c.createdBy]
  );
  return c;
}

export async function updateClause(id: string, c: Clause): Promise<Clause> {
  await query(
    'UPDATE clauses SET title=$2,category=$3,content=$4 WHERE id=$1',
    [id, c.title, c.category, c.content]
  );
  return { ...c, id };
}

export async function deleteClause(id: string): Promise<void> {
  await query('DELETE FROM clauses WHERE id=$1', [id]);
}
