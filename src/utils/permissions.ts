import type { User, Proposal, AppRole } from '../types';

export type { AppRole };
export type ProposalRole = 'owner' | 'collaborator' | 'reader' | 'admin';

/** True if user can edit any proposal (presales, sales_admin, admin) */
export function canEditAny(user: User | null): boolean {
  if (!user) return false;
  return user.appRole === 'admin' || user.appRole === 'sales_admin' || user.appRole === 'presales';
}

/** True if user can edit the catalog */
export function canEditCatalog(user: User | null): boolean {
  if (!user) return false;
  return user.appRole === 'admin' || user.appRole === 'sales_admin';
}

/** True if user can access admin settings (Settings page, user management) */
export function canAccessAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.appRole === 'admin';
}

export function getProposalRole(proposal: Proposal, user: User | null): ProposalRole {
  if (!user) return 'reader';
  if (user.appRole === 'admin') return 'admin';
  if (proposal.ownerId === user.id) return 'owner';
  if (proposal.collaboratorIds?.includes(user.id)) return 'collaborator';
  return 'reader';
}

export function canEdit(proposal: Proposal, user: User | null): boolean {
  if (!user) return false;
  if (canEditAny(user)) return true;
  const role = getProposalRole(proposal, user);
  return role === 'owner' || role === 'collaborator';
}

export function canDelete(proposal: Proposal, user: User | null): boolean {
  if (!user) return false;
  if (user.appRole === 'admin') return true;
  return proposal.ownerId === user.id;
}

export function canManageCollaborators(proposal: Proposal, user: User | null): boolean {
  const role = getProposalRole(proposal, user);
  return role === 'owner' || role === 'admin';
}

/** Human-readable role label */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin:       'Admin',
  sales_admin: 'Sales Admin',
  presales:    'Pre-Sales',
  sales:       'Sales',
};
