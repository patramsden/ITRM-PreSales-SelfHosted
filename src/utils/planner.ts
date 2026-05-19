import { PublicClientApplication, type Configuration, InteractionRequiredAuthError } from '@azure/msal-browser';
import type { Proposal } from '../types';
import { settingsApi } from '../lib/api';

// ─── MSAL instance (reused across calls within a session) ─────────────────────

let _pca: PublicClientApplication | null = null;
let _pcaKey = '';

async function getMsal(tenantId: string, clientId: string): Promise<PublicClientApplication> {
  const key = `${tenantId}:${clientId}`;
  if (_pca && _pcaKey === key) return _pca;

  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      // A dedicated blank page — avoids the app's auth guard redirecting
      // to /login and destroying the auth code before MSAL can read it.
      // This URI must be registered as a SPA redirect URI in Azure AD.
      redirectUri: `${window.location.origin}/auth-redirect.html`,
    },
    cache: { cacheLocation: 'sessionStorage' },
  };

  try {
    _pca = new PublicClientApplication(config);
    await _pca.initialize();
    _pcaKey = key;
  } catch (e) {
    _pca = null;
    _pcaKey = '';
    throw new Error(
      `Failed to initialise Microsoft sign-in. ` +
      `Check that the Tenant ID "${tenantId}" is correct. (${e instanceof Error ? e.message : e})`
    );
  }
  return _pca;
}

// ─── Token acquisition (silent first, popup fallback) ────────────────────────

const GRAPH_SCOPES = ['Tasks.ReadWrite'];

async function getToken(pca: PublicClientApplication): Promise<string> {
  const accounts = pca.getAllAccounts();

  if (accounts.length > 0) {
    try {
      const silent = await pca.acquireTokenSilent({ scopes: GRAPH_SCOPES, account: accounts[0] });
      return silent.accessToken;
    } catch (e) {
      if (!(e instanceof InteractionRequiredAuthError)) throw e;
      // Fall through to popup
    }
  }

  try {
    const popup = await pca.acquireTokenPopup({ scopes: GRAPH_SCOPES });
    return popup.accessToken;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('popup') || msg.toLowerCase().includes('blocked')) {
      throw new Error(
        'The Microsoft sign-in popup was blocked. ' +
        'Please allow popups for this site and try again.'
      );
    }
    throw new Error(`Microsoft sign-in failed: ${msg}`);
  }
}

// ─── Graph helpers ────────────────────────────────────────────────────────────

async function graphPost<T>(token: string, path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Network error calling Microsoft Graph (${path}). Check your internet connection.`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(`Graph ${path} (${res.status}): ${err?.error?.message ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function graphPatch(token: string, path: string, etag: string, body: unknown): Promise<void> {
  // Best-effort — task detail notes failing should not abort the export
  try {
    await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'If-Match': etag,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Swallow — description is non-critical
  }
}

// ─── Public export ────────────────────────────────────────────────────────────

/**
 * Signs the user in via an MSAL popup (delegated Tasks.ReadWrite permission)
 * and creates a Microsoft Planner plan from the proposal's consultancy phases.
 *
 * Azure AD setup:
 *   1. Register a Single-page application (SPA) redirect URI:
 *        https://<your-app>/auth-redirect.html
 *   2. Add Microsoft Graph → Delegated → Tasks.ReadWrite permission
 *   3. Enter Tenant ID, Client ID and Group ID in Settings → Microsoft Planner
 */
export async function convertToPlannerProject(proposal: Proposal): Promise<string> {
  // 1. Load settings — API first, Vite env vars as dev fallback
  let tenantId: string, clientId: string, groupId: string;
  try {
    const settings = await settingsApi.get();
    tenantId = (settings['planner.tenantId'] ?? '').trim();
    clientId = (settings['planner.clientId'] ?? '').trim();
    groupId  = (settings['planner.groupId']  ?? '').trim();
  } catch {
    // In dev, fall back to VITE_PLANNER_* env vars so you can test
    // without running the API locally.
    if (import.meta.env.DEV) {
      tenantId = (import.meta.env.VITE_PLANNER_TENANT_ID ?? '').trim();
      clientId = (import.meta.env.VITE_PLANNER_CLIENT_ID ?? '').trim();
      groupId  = (import.meta.env.VITE_PLANNER_GROUP_ID  ?? '').trim();

      if (!tenantId || !clientId || !groupId) {
        throw new Error(
          'API is not running. Either start it (cd api && npm run start) ' +
          'or add VITE_PLANNER_TENANT_ID, VITE_PLANNER_CLIENT_ID and ' +
          'VITE_PLANNER_GROUP_ID to your .env.local file for dev-only testing.'
        );
      }
    } else {
      throw new Error('Could not load Planner settings from the server. Is the API reachable?');
    }
  }

  if (!tenantId || !clientId || !groupId) {
    throw new Error(
      'Microsoft Planner is not fully configured. ' +
      'Go to Settings → Microsoft Planner and enter Tenant ID, Client ID and Group ID.'
    );
  }

  // 2. Authenticate — opens M365 login popup if no cached session
  const pca   = await getMsal(tenantId, clientId);
  const token = await getToken(pca);

  // 3. Create plan owned by the configured M365 Group
  const plan = await graphPost<{ id: string }>(token, '/planner/plans', {
    owner: groupId,
    title: `${proposal.projectName} — ${proposal.client}`,
  });
  const planId = plan.id;

  // 4. Create one bucket per phase, then tasks inside each bucket
  for (const phase of proposal.phases) {
    const bucket = await graphPost<{ id: string }>(token, '/planner/buckets', {
      name: phase.name, planId, orderHint: ' !',
    });

    for (const task of phase.tasks) {
      const days  = task.days % 1 === 0 ? `${task.days}` : task.days.toFixed(1);
      const hours = (task.days * 7) % 1 === 0 ? `${task.days * 7}` : (task.days * 7).toFixed(1);

      const created = await graphPost<{ id: string; '@odata.etag': string }>(
        token, '/planner/tasks', {
          planId, bucketId: bucket.id, title: task.name, orderHint: ' !',
        }
      );

      await graphPatch(token, `/planner/tasks/${created.id}/details`, created['@odata.etag'], {
        description: [
          `Role: ${task.role}`,
          `Duration: ${days} day(s) / ${hours} hr(s)`,
          `Day rate: £${task.dayRate.toLocaleString('en-GB')}`,
          task.rateMultiplier && task.rateMultiplier > 1 ? `Overtime: ${task.rateMultiplier}×` : '',
        ].filter(Boolean).join('\n'),
      });
    }
  }

  // 5. Add a Project Management bucket
  if (proposal.phases.length > 0) {
    await graphPost(token, '/planner/buckets', {
      name: 'Project Management', planId, orderHint: ' !',
    });
  }

  return `https://tasks.office.com/Home/PlanViews/${planId}`;
}
