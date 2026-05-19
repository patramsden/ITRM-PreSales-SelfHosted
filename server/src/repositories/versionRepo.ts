import { v4 as uuid } from 'uuid';
import { query } from '../shared/db';

export interface VersionMeta {
  id: string; proposalId: string; savedBy: string; savedAt: string;
}

export async function saveVersion(proposalId: string, snapshot: string, savedBy: string): Promise<void> {
  await query('INSERT INTO proposal_versions (id,proposal_id,snapshot,saved_by) VALUES ($1,$2,$3,$4)',
    [uuid(), proposalId, snapshot, savedBy]);
}

export async function listVersions(proposalId: string): Promise<VersionMeta[]> {
  const rows = await query(
    'SELECT id,proposal_id,saved_by,saved_at FROM proposal_versions WHERE proposal_id=$1 ORDER BY saved_at DESC',
    [proposalId],
  );
  return rows.map(r => ({
    id:         r.id           as string,
    proposalId: r.proposal_id  as string,
    savedBy:    r.saved_by     as string,
    savedAt:    (r.saved_at as Date).toISOString(),
  }));
}

export async function getVersionSnapshot(versionId: string): Promise<string | null> {
  const rows = await query<{ snapshot: string }>('SELECT snapshot FROM proposal_versions WHERE id=$1', [versionId]);
  return rows.length ? rows[0].snapshot : null;
}
