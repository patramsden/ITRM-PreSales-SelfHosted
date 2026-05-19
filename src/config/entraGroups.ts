/**
 * Entra ID Group Object IDs that control access within this app.
 *
 * Set each variable in your .env file:
 *   VITE_ENTRA_GROUP_PRESALES_ADMIN=<Object ID from Entra ID portal>
 *
 * To find a group's Object ID:
 *   Azure Portal → Entra ID → Groups → <group name> → Overview → Object ID
 *
 * The MOCK_GROUP_ID is only used in dev when the env var is not set.
 * In production, always set the real group ID so membership is enforced
 * against your tenant's Entra groups.
 */

const MOCK_GROUP_ID = 'mock-presales-admin-group';

export const ENTRA_GROUPS = {
  /**
   * Members of this group can create/edit/delete Templates, Catalog items,
   * and Rate Cards, and have admin-override access to any proposal.
   */
  PRESALES_ADMIN: import.meta.env.VITE_ENTRA_GROUP_PRESALES_ADMIN ?? MOCK_GROUP_ID,
} as const;
