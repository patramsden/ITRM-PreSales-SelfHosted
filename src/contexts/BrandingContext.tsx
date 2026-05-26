import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { settingsApi } from '../lib/api';

interface BrandingCtx {
  logo: string | null;        // data URL or null → falls back to /msp-logo.svg
  favicon: string | null;     // data URL or null → falls back to /favicon.svg
  primaryColor: string;       // hex e.g. #2B3990
  companyName: string;
  subtitle: string;
  isLoaded: boolean;
}

const DEFAULT: BrandingCtx = {
  logo: null,
  favicon: null,
  primaryColor: '#2B3990',
  companyName: 'MSP SalesPro',
  subtitle: 'Sales Platform',
  isLoaded: false,
};

const BrandingContext = createContext<BrandingCtx>(DEFAULT);

export function useBranding() {
  return useContext(BrandingContext);
}

function applyColor(hex: string) {
  let style = document.getElementById('branding-vars') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'branding-vars';
    document.head.appendChild(style);
  }
  style.textContent = `:root { --brand-primary: ${hex}; }`;
  document.documentElement.style.setProperty('--brand-primary', hex);
}

function applyFavicon(dataUrl: string | null) {
  // Find or create the <link rel="icon"> element
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = dataUrl ?? '/favicon.svg';
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<BrandingCtx>(DEFAULT);

  useEffect(() => {
    settingsApi.get()
      .then(s => {
        const color   = ((s['branding.primaryColor'] as string) ?? '').trim() || '#2B3990';
        const logo    = (s['branding.logo']     as string | undefined) || null;
        const favicon = (s['branding.favicon']  as string | undefined) || null;
        const company = ((s['branding.companyName'] as string) ?? '').trim() || 'MSP SalesPro';
        const sub     = ((s['branding.subtitle']    as string) ?? '').trim() || 'Sales Platform';
        applyColor(color);
        applyFavicon(favicon);
        setCtx({ logo, favicon, primaryColor: color, companyName: company, subtitle: sub, isLoaded: true });
      })
      .catch(() => {
        applyColor(DEFAULT.primaryColor);
        setCtx({ ...DEFAULT, isLoaded: true });
      });
  }, []);

  return (
    <BrandingContext.Provider value={ctx}>
      {children}
    </BrandingContext.Provider>
  );
}
