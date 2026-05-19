/**
 * MSAL / Microsoft Graph integration scaffold.
 *
 * To activate real Entra ID auth:
 *
 * 1. Install packages:
 *      npm install @azure/msal-browser @azure/msal-react
 *
 * 2. Register an app in Entra ID:
 *    - Azure Portal → Entra ID → App registrations → New registration
 *    - Redirect URI: http://localhost:5173 (dev) + your prod URL
 *    - API permissions: Microsoft Graph → User.Read, GroupMember.Read.All
 *    - Under "Token configuration" add a groups claim (or use transitive memberOf)
 *
 * 3. Add to .env:
 *      VITE_ENTRA_CLIENT_ID=<Application (client) ID>
 *      VITE_ENTRA_TENANT_ID=<Directory (tenant) ID>
 *      VITE_ENTRA_GROUP_PRESALES_ADMIN=<Object ID of your admin group>
 *
 * 4. Replace MockAuthProvider in AuthContext.tsx with MsalAuthProvider (below).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Example MsalConfig (uncomment when packages are installed):
 * ─────────────────────────────────────────────────────────────────────────────

import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: 'sessionStorage' },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: ['User.Read', 'GroupMember.Read.All'],
};

// ─────────────────────────────────────────────────────────────────────────────
// After login, fetch the signed-in user's transitive group memberships:
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchUserGroups(accessToken: string): Promise<string[]> {
  const res = await fetch(
    'https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group?$select=id',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.value as { id: string }[]).map(g => g.id);
}

 * ─────────────────────────────────────────────────────────────────────────────
 * Wrap your app in MsalProvider (in main.tsx):
 * ─────────────────────────────────────────────────────────────────────────────

import { MsalProvider } from '@azure/msal-react';
// <MsalProvider instance={msalInstance}><App /></MsalProvider>

 * ─────────────────────────────────────────────────────────────────────────────
 * Then in AuthContext, use useMsal() + fetchUserGroups() to populate
 * currentUser.groups after the user signs in.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export {};
