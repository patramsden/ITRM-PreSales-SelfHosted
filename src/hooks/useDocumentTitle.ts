import { useEffect } from 'react';
import { useBranding } from '../contexts/BrandingContext';

/**
 * Sets the browser tab title.
 * - No pageTitle  →  "ITRM PreSales"  (home / dashboard)
 * - With pageTitle →  "Proposals — ITRM PreSales"
 *
 * The app name is pulled from branding settings so it reflects any
 * custom company name configured in Settings → Branding.
 */
export function useDocumentTitle(pageTitle?: string) {
  const { companyName, subtitle } = useBranding();
  const appName = [companyName, subtitle].filter(Boolean).join(' ');

  useEffect(() => {
    const prev = document.title;
    document.title = pageTitle ? `${pageTitle} — ${appName}` : appName;
    return () => { document.title = prev; };
  }, [pageTitle, appName]);
}
