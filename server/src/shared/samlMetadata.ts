/**
 * SAML federation metadata helpers.
 *
 * Fetches the IdP's federation metadata XML, extracts signing certificates, and
 * caches them in app_settings so they're available across serverless invocations.
 * The cache is refreshed whenever it is older than REFRESH_INTERVAL_MS (24 h).
 */

import { updateAppSettings, SETTING_KEYS } from '../repositories/settingsRepo';

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── XML parsing ─────────────────────────────────────────────────────────────

/**
 * Extract base64-encoded signing certificates from a SAML metadata XML string.
 * Returns one entry per <X509Certificate> found inside a use="signing"
 * KeyDescriptor. Falls back to all X509Certificate elements if none are
 * marked as signing (some IdPs omit the use attribute).
 */
export function extractCertsFromMetadataXml(xml: string): string[] {
  const strip = (s: string) => s.replace(/\s+/g, '');

  // Try signing-specific key descriptors first
  const certs: string[] = [];
  const signingRe = /<KeyDescriptor[^>]+use=["']signing["'][^>]*>([\s\S]*?)<\/KeyDescriptor>/gi;
  for (const block of xml.matchAll(signingRe)) {
    const m = block[1].match(/<X509Certificate[^>]*>([\s\S]+?)<\/X509Certificate>/i);
    if (m) certs.push(strip(m[1]));
  }

  // Fall back to any X509Certificate if no signing-tagged keys found
  if (certs.length === 0) {
    for (const m of xml.matchAll(/<X509Certificate[^>]*>([\s\S]+?)<\/X509Certificate>/gi)) {
      certs.push(strip(m[1]));
    }
  }

  return [...new Set(certs)]; // deduplicate
}

// ─── Fetch & persist ─────────────────────────────────────────────────────────

/** Fetch metadata XML and return the signing certs. Throws on network/parse error. */
export async function fetchCertsFromMetadataUrl(url: string): Promise<string[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Metadata fetch failed: HTTP ${res.status} ${res.statusText}`);
  const xml = await res.text();
  const certs = extractCertsFromMetadataXml(xml);
  if (certs.length === 0) throw new Error('No signing certificates found in federation metadata');
  return certs;
}

/**
 * Always fetches fresh certs from the metadata URL and persists them to
 * app_settings. Used by the admin "Refresh now" endpoint and the daily timer.
 */
export async function refreshCertsFromMetadata(metadataUrl: string): Promise<{ certs: string[]; refreshedAt: number }> {
  const certs = await fetchCertsFromMetadataUrl(metadataUrl);
  const refreshedAt = Date.now();
  await updateAppSettings({
    [SETTING_KEYS.SSO_IDP_CERT]:       certs.join('\n'),
    [SETTING_KEYS.SSO_CERT_REFRESHED]: String(refreshedAt),
  });
  return { certs, refreshedAt };
}

// ─── Lazy-refresh helper used by buildSamlInstance ───────────────────────────

/**
 * Returns the IdP cert(s) to use, refreshing from the metadata URL if:
 *   - a metadataUrl is configured, AND
 *   - no cert is cached, OR the cached cert is older than 24 h.
 *
 * On network failure falls back silently to the cached cert.
 *
 * @param cfg  Full app_settings record (already loaded from DB).
 * @returns    Single cert string or newline-joined list of certs, or undefined
 *             if no cert is available.
 */
export async function ensureFreshCert(cfg: Record<string, string>): Promise<string | undefined> {
  const metadataUrl = (cfg[SETTING_KEYS.SSO_METADATA_URL] ?? '').trim();
  const cachedCert  = (cfg[SETTING_KEYS.SSO_IDP_CERT]     ?? '').trim();

  // No metadata URL — return whatever is stored (manual paste or empty)
  if (!metadataUrl) return cachedCert || undefined;

  // Parse timestamp robustly: stored as epoch-ms string by the backend, but
  // may have been overwritten as an ISO string by an older frontend save.
  const raw = (cfg[SETTING_KEYS.SSO_CERT_REFRESHED] ?? '').trim();
  const lastRefreshed = raw ? (Number(raw) || new Date(raw).getTime() || 0) : 0;
  const stale = Date.now() - lastRefreshed > REFRESH_INTERVAL_MS;

  if (!stale && cachedCert) return cachedCert;

  try {
    const { certs } = await refreshCertsFromMetadata(metadataUrl);
    return certs.join('\n');
  } catch (err) {
    console.warn('[saml] Metadata refresh failed, falling back to cached cert:', err);
    return cachedCert || undefined;
  }
}

/** Split a stored cert string (newline-separated) into individual cert values for node-saml. */
export function splitCerts(cert: string): string | string[] {
  const parts = cert.split('\n').map(s => s.trim()).filter(Boolean);
  return parts.length === 1 ? parts[0] : parts;
}
