/**
 * Thin fetch wrapper for the Azure Functions API.
 * Base URL is empty in dev (Vite proxy) and in production (same origin via SWA routing).
 */

const BASE = import.meta.env.DEV ? 'http://localhost:7071' : '';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}/api/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `API error ${res.status}`);
  }
  return res.json();
}

export const api = {
  get:    <T>(path: string)                => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown) => request<T>('POST',   path, body),
  put:    <T>(path: string, body: unknown) => request<T>('PUT',    path, body),
  delete: <T>(path: string)               => request<T>('DELETE', path),
};

// ─── Typed resource helpers ───────────────────────────────────────────────────

import type {
  Proposal, User, Template, CatalogItem, RateCard,
} from '../types';
import type { AppLookups } from '../store';

const BASE_URL = import.meta.env.DEV ? 'http://localhost:7071' : '';

export const mfaEnrollApi = {
  start:    (enrollToken: string) =>
    api.post<{ secret: string; formattedSecret: string; qrCode: string }>('auth/totp/start-enrollment', { enrollToken }),
  complete: (enrollToken: string, secret: string, code: string) =>
    api.post<{ token: string; user: User } | { error: string; newEnrollToken: string }>('auth/totp/complete-enrollment', { enrollToken, secret, code }),
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('auth/login', { email, password }),
  logout: () => api.post<void>('auth/logout', {}),
  exchangeSaml: (code: string) =>
    api.post<{ token: string; user: User }>('auth/saml/exchange', { code }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<void>('auth/change-password', { currentPassword, newPassword }),
  config: () => api.get<{ ssoEnabled: boolean; ssoLogoutUrl: string | null }>('auth/config'),
  samlEnabled: () => import.meta.env.VITE_SAML_ENABLED === 'true',
};

export const proposalApi = {
  list:   ()                          => api.get<Proposal[]>('proposals'),
  create: (p: Proposal)               => api.post<Proposal>('proposals', p),
  update: (id: string, p: Proposal)   => api.put<Proposal>(`proposals/${id}`, p),
  delete: (id: string)                => api.delete<void>(`proposals/${id}`),
};

export const userApi = {
  list:   ()                        => api.get<User[]>('users'),
  create: (u: User & { password?: string }) => api.post<User>('users', u),
  update: (id: string, u: User & { newPassword?: string }) => api.put<User>(`users/${id}`, u),
  delete: (id: string)              => api.delete<void>(`users/${id}`),
};

export const templateApi = {
  list:   ()                             => api.get<Template[]>('templates'),
  create: (t: Template)                  => api.post<Template>('templates', t),
  update: (id: string, t: Template)      => api.put<Template>(`templates/${id}`, t),
  delete: (id: string)                   => api.delete<void>(`templates/${id}`),
};

export const catalogApi = {
  list:   ()                                   => api.get<CatalogItem[]>('catalog'),
  create: (item: CatalogItem)                  => api.post<CatalogItem>('catalog', item),
  update: (id: string, item: CatalogItem)      => api.put<CatalogItem>(`catalog/${id}`, item),
  delete: (id: string)                         => api.delete<void>(`catalog/${id}`),
};

export const rateCardApi = {
  list:   ()                                => api.get<RateCard[]>('rate-cards'),
  create: (r: RateCard)                     => api.post<RateCard>('rate-cards', r),
  update: (id: string, r: RateCard)         => api.put<RateCard>(`rate-cards/${id}`, r),
  delete: (id: string)                      => api.delete<void>(`rate-cards/${id}`),
  import: (cards: Partial<RateCard>[])      => api.post<{ imported: number }>('rate-cards/import', cards),
};

// ─── CRM (Autotask proxy) ─────────────────────────────────────────────────────

export interface CrmCompany {
  id: number;
  companyName: string;
  phone?: string;
  city?: string;
}

export interface CrmCompanyAddress {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface CrmContact {
  id: number;
  firstName: string;
  lastName: string;
  emailAddress?: string;
  title?: string;
}

export interface CrmTicket {
  id: number;
  ticketNumber: string | null;
  title: string;
  status: string;
  queue: string;
  createDate: string | null;
  url: string;
}

export interface AtPicklistValue {
  value: number;
  label: string;
  isActive: boolean;
  isDefaultValue: boolean;
}

export const crmApi = {
  status:             ()                  => api.get<{ configured: boolean }>('crm/status'),
  searchCompanies:    (search: string)    => api.get<CrmCompany[]>(`crm/companies?search=${encodeURIComponent(search)}`),
  getContacts:        (companyId: number) => api.get<CrmContact[]>(`crm/contacts?companyId=${companyId}`),
  getAccountManager:  (companyId: number) => api.get<{ name: string | null; contactId: number | null }>(`crm/account-manager?companyId=${companyId}`),
  testConnection:     ()                  => api.post<{ success: boolean; message: string; zoneUrl?: string; detectedZone?: string; username?: string; integrationCodeHint?: string }>('crm/test', {}),
  detectZone:         (username: string)  => api.post<{ zoneUrl: string }>('crm/detect-zone', { username }),
  createTicket:       (data: { title: string; companyID: number; description?: string }) =>
    api.post<{ ticketId: number; url: string }>('crm/create-ticket', data),
  getPicklist:        (entity: string, field: string) =>
    api.get<AtPicklistValue[]>(`crm/picklist?entity=${encodeURIComponent(entity)}&field=${encodeURIComponent(field)}`),
  getPicklistsBatch:  (entity: string, fields: string[]) =>
    api.get<Record<string, AtPicklistValue[]>>(`crm/picklists-batch?entity=${encodeURIComponent(entity)}&fields=${fields.map(encodeURIComponent).join(',')}`),
  getTickets:         (companyId: number) =>
    api.get<CrmTicket[]>(`crm/tickets?companyId=${companyId}`),
  getCompanyAddress:  (companyId: number) =>
    api.get<CrmCompanyAddress>(`crm/company-address?id=${companyId}`),
  getOpportunityStages: () =>
    api.get<AtPicklistValue[]>('crm/opportunity-stages'),
  createOpportunity: (data: { proposalId: string; projectName: string; client: string; accountManager: string; crmCompanyId: string }) =>
    api.post<{ opportunityId: string; url: string }>('crm/create-opportunity', data),
  syncOpportunity: (data: { proposalId: string; projectName?: string; client?: string; accountManager?: string; crmCompanyId?: string; atOpportunityId?: string }) =>
    api.post<{ opportunityId: string; url: string }>('crm/sync-opportunity', data),
};

export const lookupsApi = {
  get:    ()                    => api.get<AppLookups>('lookups'),
  update: (l: AppLookups)       => api.put<AppLookups>('lookups', l),
};

// ─── App settings (AI + SSO config) ──────────────────────────────────────────

export interface AppSettings {
  'ai.provider'?:          string;
  'ai.azure.endpoint'?:    string;
  'ai.azure.deployment'?:  string;
  'ai.azure.apiVersion'?:  string;
  // AI keys are write-only — GET returns '.configured' booleans instead
  'ai.azure.key'?:                  string; // write-only
  'ai.azure.key.configured'?:       string; // 'true'|'false' — read-only indicator
  'ai.anthropic.key'?:              string; // write-only
  'ai.anthropic.key.configured'?:   string; // 'true'|'false' — read-only indicator
  'sso.enabled'?:               string;
  'sso.logoutUrl'?:             string;
  'sso.entryPoint'?:            string;
  'sso.issuer'?:                string;
  'sso.idpCert'?:               string;  // write-only — never returned by GET
  'sso.idpCert.configured'?:    string;  // 'true'|'false' — read-only indicator
  'sso.metadataUrl'?:           string;  // federation metadata URL for auto-refresh
  'sso.certLastRefreshed'?:     string;  // ISO timestamp of last successful refresh
  'sso.appUrl'?:                string;
  'notifications.slackWebhook'?: string;
  'notifications.teamsWebhook'?: string;
  // Microsoft Planner integration (delegated — no secret required)
  'planner.tenantId'?: string;
  'planner.clientId'?: string;
  'planner.groupId'?:  string;

  // Password policy
  'security.pw.minLength'?:        string;
  'security.pw.requireUppercase'?: string;
  'security.pw.requireLowercase'?: string;
  'security.pw.requireNumber'?:    string;
  'security.pw.requireSpecial'?:   string;
  // MFA enforcement + session timeout
  'security.requireMfa'?:          string;  // 'true'|'false'
  'security.sessionTimeoutHours'?: string;  // number of hours, default 8

  // Branding
  'branding.logo'?:         string;   // base64 data URL
  'branding.favicon'?:      string;   // base64 data URL (ICO/PNG/SVG)
  'branding.primaryColor'?: string;   // hex e.g. #2B3990
  'branding.companyName'?:  string;
  'branding.subtitle'?:     string;

  // SCIM provisioning
  'scim.enabled'?:             string;  // 'true'|'false'
  'scim.token'?:               string;  // write-only bearer token
  'scim.token.configured'?:    string;  // 'true'|'false' read-only indicator

  // Email — shared
  'email.enabled'?:   string;  // 'true'|'false'
  'email.provider'?:  string;  // 'smtp' | 'graph'
  'email.from'?:      string;  // fallback display name + address

  // Email — SMTP provider
  'email.host'?:                string;
  'email.port'?:                string;
  'email.secure'?:              string;  // 'true'|'false'
  'email.user'?:                string;
  'email.password'?:            string;  // write-only
  'email.password.configured'?: string;  // 'true'|'false' read-only indicator

  // Email — Microsoft 365 / Graph provider
  'email.graph.tenantId'?:                  string;  // Azure AD tenant ID
  'email.graph.clientId'?:                  string;  // App registration client ID
  'email.graph.clientSecret'?:              string;  // write-only (encrypted at rest)
  'email.graph.clientSecret.configured'?:   string;  // 'true'|'false' read-only indicator
  'email.graph.defaultSender'?:             string;  // fallback mailbox (e.g. noreply@company.com)

  // Proposal layout
  'proposal.layout'?: string;  // JSON-serialised ProposalLayoutConfig

  // Discount approval floor
  'discount.markupFloor'?: string;  // minimum markup % before discount approval is required

  // CRM — Autotask
  'crm.provider'?:                       string;  // 'autotask' | 'none'
  'crm.autotask.zoneUrl'?:               string;
  'crm.autotask.integrationCode'?:       string;
  'crm.autotask.username'?:              string;
  'crm.autotask.secret'?:                string;  // write-only
  'crm.autotask.secret.configured'?:     string;  // 'true'|'false' read-only indicator

  // Autotask ticket export configuration
  'crm.autotask.ticket.queueId'?:        string;  // numeric picklist value
  'crm.autotask.ticket.ticketTypeId'?:   string;  // numeric picklist value
  'crm.autotask.ticket.priorityId'?:     string;  // numeric picklist value
  'crm.autotask.ticket.statusId'?:       string;  // numeric picklist value

  // Ticket panel (proposal summary tab) configuration
  'crm.tickets.queueIds'?:  string;  // comma-separated numeric queue IDs
  'crm.tickets.daysBack'?:  string;  // number of days to look back (default 90)

  // Opportunity auto-create configuration
  'crm.autotask.opportunity.enabled'?:       string;  // 'true' | 'false'
  'crm.autotask.opportunity.stageId'?:       string;  // numeric picklist value
  'crm.autotask.opportunity.probability'?:   string;  // 0–100
  'crm.autotask.opportunity.closeDateDays'?: string;  // days from today
  'crm.autotask.opportunity.titleTemplate'?: string;  // e.g. '{projectName} — {client}'
  'crm.autotask.opportunity.urlTemplate'?:   string;  // e.g. 'https://ww5.autotask.net/Autotask/views/opportunity/viewopportunity.aspx?opportunityID={id}'

  // Support proposal document — company boilerplate sections
  'support.doc.intro'?:                string;
  'support.doc.background'?:           string;
  'support.doc.staff'?:                string;
  'support.doc.certifications'?:       string;
  'support.doc.serviceRequirements'?:  string;
  'support.doc.businessRequirements'?: string;
  'support.doc.contractualTerms'?:     string;
  'support.doc.confidentialityNotice'?:string;
  'support.doc.companyAddress'?:       string;  // footer address line
  'support.doc.companyWebsite'?:       string;  // footer website
  'support.doc.companyPhone'?:         string;  // footer phone
  // Per-section images (base64 data URLs)
  'support.doc.image.intro'?:                string;
  'support.doc.image.background'?:           string;
  'support.doc.image.staff'?:                string;
  'support.doc.image.certifications'?:       string;
  'support.doc.image.serviceRequirements'?:  string;
  'support.doc.image.businessRequirements'?: string;
  'support.doc.image.contractualTerms'?:     string;
  'support.doc.image.confidentialityNotice'?:string;
}

export const settingsApi = {
  get:    ()                      => api.get<AppSettings>('settings'),
  update: (s: AppSettings)        => api.put<AppSettings>('settings', s),
};

export const ssoApi = {
  refreshMetadata: () =>
    api.post<{ success: boolean; certsFound: number; refreshedAt: string }>('auth/saml/refresh-metadata', {}),
  certInfo: () =>
    api.get<{
      configured: boolean; certsCount?: number; thumbprints?: string[];
      metadataUrl: boolean; lastRefreshed: string | null;
    }>('auth/saml/cert-info'),
};

// ─── Version history ──────────────────────────────────────────────────────────

export const versionApi = {
  list:    (pid: string) =>
    api.get<{ id: string; proposalId: string; savedBy: string; savedAt: string }[]>(`proposals/${pid}/versions`),
  restore: (pid: string, vid: string) =>
    api.post<Proposal>(`proposals/${pid}/versions/${vid}/restore`, {}),
  save:    (pid: string) => api.post<void>(`proposals/${pid}/versions`, {}),
  get:     (pid: string, vid: string) => api.get<Proposal>(`proposals/${pid}/versions/${vid}`),
};

// ─── Shareable links ──────────────────────────────────────────────────────────

export const shareApi = {
  create: (pid: string, expiresAt?: string) =>
    api.post<{ token: string }>(`proposals/${pid}/share`, { expiresAt }),
  list:   (pid: string) =>
    api.get<{ token: string; createdAt: string; expiresAt?: string }[]>(`proposals/${pid}/shares`),
  delete: (token: string) => api.delete<void>(`share/${token}`),
  getPublic: (token: string) =>
    fetch(`${BASE_URL}/api/share/${token}`).then(r => {
      if (!r.ok) throw new Error('Not found');
      return r.json() as Promise<Proposal>;
    }),
};

// ─── Customer links ───────────────────────────────────────────────────────────

export interface CustomerLink {
  token: string;
  proposalId: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  defaultTheme: 'light' | 'dark';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  signedAt?: string;
  signedByName?: string;
  signerIp?: string;
  signerNotes?: string;
}

export const customerApi = {
  create:    (pid: string, opts?: { expiresAt?: string; defaultTheme?: 'light' | 'dark' }) =>
    api.post<{ token: string; url: string }>(`proposals/${pid}/customer-link`, opts ?? {}),
  list:      (pid: string) => api.get<CustomerLink[]>(`proposals/${pid}/customer-links`),
  delete:    (token: string) => api.delete<void>(`customer-link/${token}`),
  getPublic: (token: string) =>
    fetch(`${BASE_URL}/api/customer/${token}`).then(r => {
      if (!r.ok) throw new Error('Not found');
      return r.json() as Promise<{
        proposal: Proposal;
        link: CustomerLink;
        layoutRaw?: string;
        branding?: { logoB64: string | null; primaryColor: string; companyName: string };
      }>;
    }),
  sign: (token: string, data: { status: 'approved' | 'rejected'; notes?: string; signerName?: string }) =>
    fetch(`${BASE_URL}/api/customer/${token}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json() as Promise<{ signed: boolean; status: string }>),
};

// ─── Service API keys (named, multi-key) ──────────────────────────────────────

export interface ApiKeyInfo {
  id: string;
  label: string;
  createdAt: string;
  lastUsed?: string;
}

export const apiKeysApi = {
  list:   ()             => api.get<ApiKeyInfo[]>('settings/api-keys'),
  create: (label: string) => api.post<ApiKeyInfo & { key: string }>('settings/api-keys', { label }),
  revoke: (id: string)   => api.delete<void>(`settings/api-keys/${id}`),
};

// Legacy single-key API (kept for backward compat)
export const serviceKeyApi = {
  status:   () => api.get<{ configured: boolean }>('settings/service-key/status'),
  generate: () => api.post<{ serviceApiKey: string }>('settings/service-key', {}),
  revoke:   () => api.delete<void>('settings/service-key'),
};

// ─── System logs ──────────────────────────────────────────────────────────────

export interface LogEntry {
  id:        string;
  createdAt: string;
  level:     'info' | 'warn' | 'error';
  category:  string;
  message:   string;
  details?:  string;
  userId?:   string;
  userName?: string;
}

export const logsApi = {
  list: (params?: { level?: string; category?: string; search?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.level)    q.set('level',    params.level);
    if (params?.category) q.set('category', params.category);
    if (params?.search)   q.set('search',   params.search);
    if (params?.limit)    q.set('limit',    String(params.limit));
    return api.get<{ logs: LogEntry[]; total: number }>(`logs?${q}`);
  },
  clear: () => api.delete<void>('logs'),
};

// ─── Comments ─────────────────────────────────────────────────────────────────

import type { ProposalComment, Clause } from '../types';

export const commentApi = {
  list:   (pid: string)                       => api.get<ProposalComment[]>(`proposals/${pid}/comments`),
  create: (pid: string, data: { content: string }) => api.post<ProposalComment>(`proposals/${pid}/comments`, data),
  delete: (id: string)                        => api.delete<void>(`comments/delete/${id}`),
};

// ─── Clause library ───────────────────────────────────────────────────────────

export const clauseApi = {
  list:   ()                             => api.get<Clause[]>('clauses'),
  create: (c: Omit<Clause, 'id' | 'createdAt'>) => api.post<Clause>('clauses', c),
  update: (id: string, c: Clause)        => api.put<Clause>(`clauses/${id}`, c),
  delete: (id: string)                   => api.delete<void>(`clauses/${id}`),
};

// ─── Profile (self-service) ───────────────────────────────────────────────────

export const profileApi = {
  update: (updates: {
    name?: string;
    department?: string;
    jobTitle?: string;
    avatar?: string | null;
    clearAvatar?: boolean;
  }) => api.put<import('../types').User>('me', updates),
};

// ─── Auth extras ─────────────────────────────────────────────────────────────

export const totpApi = {
  status:  () => api.get<{ totpEnabled: boolean }>('auth/totp/status'),
  setup:   () => api.post<{ secret: string; formattedSecret: string; qrCode: string }>('auth/totp/setup', {}),
  enable:  (secret: string, code: string) => api.post<void>('auth/totp/enable', { secret, code }),
  disable: () => api.delete<void>('auth/totp'),
  login:   (challengeToken: string, code: string) =>
    api.post<{ token: string; user: import('../types').User }>('auth/totp/login', { challengeToken, code }),
};

export const passwordResetApi = {
  request: (email: string) =>
    api.post<{ resetUrl: string; message: string }>('auth/password-reset/request', { email }),
  confirm: (token: string, password: string) =>
    api.post<{ message: string }>('auth/password-reset/confirm', { token, password }),
};

export const adminUserApi = {
  generateResetLink: (userId: string) =>
    api.post<{ resetUrl: string }>(`users/${userId}/password-reset`, {}),
  clearTotp: (userId: string) =>
    api.delete<void>(`users/${userId}/totp`),
  setPassword: (userId: string, password: string) =>
    api.post<void>(`users/${userId}/set-password`, { password }),
};

// ─── Catalog import ───────────────────────────────────────────────────────────

export const catalogImportApi = {
  import: (items: Omit<CatalogItem, 'id'>[]) =>
    api.post<{ imported: number }>('catalog/import', items),
};
