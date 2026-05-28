/**
 * Fetches all data from the API on app load and populates the Zustand store.
 * Renders a full-screen loading state while in flight, then renders children.
 * Falls back to seed data if the API is unreachable (dev without a running API).
 */
import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore, SEED_DATA } from '../store';
import { useAuth } from '../contexts/AuthContext';
import {
  proposalApi, userApi, templateApi, catalogApi, rateCardApi, lookupsApi,
  clauseApi, settingsApi,
} from '../lib/api';
import type { AppLookups } from '../store';
import type { Proposal, User, Template, CatalogItem, RateCard, Clause } from '../types';

// Minimum gap between two back-to-back tab-visibility refreshes (e.g. rapid
// alt-tab). Route changes always refresh immediately with no cooldown.
const VISIBILITY_COOLDOWN_MS = 5_000;

interface Props { children: React.ReactNode }

export function StoreInitializer({ children }: Props) {
  const { initialized, initFromApi, setDiscountMarkupFloor } = useStore();
  const { authLoading } = useAuth();
  const [error, setError]       = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const lastVisibilityRefresh = useRef<number>(0);

  // Listen for background mutation failures and surface a dismissible banner
  useEffect(() => {
    const handler = (e: Event) => {
      const { label } = (e as CustomEvent<{ label: string; message: string }>).detail;
      setSyncError(`Save failed (${label}) — refresh the page if your change didn't persist.`);
    };
    window.addEventListener('store:sync-error', handler);
    return () => window.removeEventListener('store:sync-error', handler);
  }, []);
  const location = useLocation();

  // Re-fetch all data from the API and update the store
  const refreshAll = async () => {
    try {
      const [proposals, users, templates, catalog, rateCards, lookups, clauses] = await Promise.all([
        proposalApi.list(),
        userApi.list(),
        templateApi.list(),
        catalogApi.list(),
        rateCardApi.list(),
        lookupsApi.get(),
        clauseApi.list().catch(() => [] as Clause[]),
      ]) as [Proposal[], User[], Template[], CatalogItem[], RateCard[], AppLookups, Clause[]];
      useStore.setState({ proposals, users, templates, catalog, rateCards, lookups, clauses });
    } catch { /* silent background refresh — never break the UI */ }
  };

  // Re-fetch when the tab becomes visible again (user switches back from another tab/app).
  // A short cooldown prevents hammering the API on rapid alt-tab.
  useEffect(() => {
    if (!initialized) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastVisibilityRefresh.current < VISIBILITY_COOLDOWN_MS) return;
      lastVisibilityRefresh.current = now;
      refreshAll();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [initialized]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch on every route change — no cooldown so data is always fresh on navigation
  useEffect(() => {
    if (!initialized) return;
    refreshAll();
  }, [location.pathname, initialized]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Wait until auth has resolved before fetching data
    if (authLoading || initialized) return;

    let cancelled = false;

    async function load() {
      try {
        const [proposals, users, templates, catalog, rateCards, lookups, clauses, settings] =
          await Promise.all([
            proposalApi.list(),
            userApi.list(),
            templateApi.list(),
            catalogApi.list(),
            rateCardApi.list(),
            lookupsApi.get(),
            clauseApi.list().catch(() => [] as Clause[]),
            settingsApi.get().catch(() => ({})),
          ]) as [Proposal[], User[], Template[], CatalogItem[], RateCard[], AppLookups, Clause[], Record<string, string>];

        if (!cancelled) {
          initFromApi({ proposals, users, templates, catalog, rateCards, lookups });
          useStore.setState({ clauses });
          const floor = parseFloat(settings['discount.markupFloor'] ?? '10');
          if (!isNaN(floor)) setDiscountMarkupFloor(floor);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[StoreInitializer] API unavailable, using seed data:', e);
          // In dev: fall back to seed data so the app is usable without an API.
          // In prod: initialise with empty collections — real data only from API.
          if (import.meta.env.DEV) {
            initFromApi(SEED_DATA);
          } else {
            initFromApi({ proposals: [], users: [], templates: [], catalog: [], rateCards: [], lookups: { catalogCategories: [], departments: [] } });
          }
          setError(
            import.meta.env.DEV
              ? 'API not running — showing seed data. Start the Functions API on port 7071.'
              : 'Could not load data. Please refresh the page.'
          );
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [initialized, initFromApi, authLoading]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 dark:text-slate-400">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Dev-only: API unreachable banner */}
      {error && import.meta.env.DEV && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-xs text-amber-800 shadow-lg">
          <strong>Dev mode:</strong> {error}
        </div>
      )}
      {/* Mutation sync failure — shown in any environment */}
      {syncError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-full bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-xs text-red-800 shadow-lg flex items-center justify-between gap-3">
          <span>⚠ {syncError}</span>
          <button onClick={() => setSyncError(null)} className="shrink-0 text-red-600 hover:text-red-800 font-medium underline">
            Dismiss
          </button>
        </div>
      )}
      {children}
    </>
  );
}
