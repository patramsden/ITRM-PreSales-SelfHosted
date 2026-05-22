import { query } from '../shared/db';
import type { ProposalComment } from '../types/index';

function toComment(r: Record<string, unknown>): ProposalComment {
  return {
    id:          r.id as string,
    proposalId:  r.proposal_id as string,
    authorId:    r.author_id as string,
    authorName:  r.author_name as string,
    content:     r.content as string,
    createdAt:   (r.created_at as Date).toISOString(),
  };
}

export async function listComments(proposalId: string): Promise<ProposalComment[]> {
  const rows = await query(
    'SELECT * FROM proposal_comments WHERE proposal_id=$1 ORDER BY created_at ASC',
    [proposalId]
  );
  return rows.map(toComment);
}

export async function createComment(c: ProposalComment): Promise<ProposalComment> {
  await query(
    'INSERT INTO proposal_comments (id,proposal_id,author_id,author_name,content) VALUES ($1,$2,$3,$4,$5)',
    [c.id, c.proposalId, c.authorId, c.authorName, c.content]
  );
  return c;
}

export async function deleteComment(id: string, requestorId: string, isAdmin: boolean): Promise<boolean> {
  const existing = await query('SELECT author_id FROM proposal_comments WHERE id=$1', [id]);
  if (existing.length === 0) return false;
  if (!isAdmin && existing[0].author_id !== requestorId) return false;
  await query('DELETE FROM proposal_comments WHERE id=$1', [id]);
  return true;
}
