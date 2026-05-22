/**
 * Fetches all data from the API on app load and populates the Zustand store.
 * Renders a full-screen loading state while in flight, then renders children.
 * Falls back to seed data if the API is unreachable (dev without a running API).
 */
import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { useAuth } from '../contexts/AuthContext';
import {
  proposalApi, userApi, templateApi, catalogApi, rateCardApi, lookupsApi,
} from '../lib/api';
import type { AppLookups } from '../store';
import type { Proposal, User, Template, CatalogItem, RateCard } from '../types';

const REFRESH_COOLDOWN_MS = 30_000; // don't re-fetch more than once every 30 s

interface Props { children: React.ReactNode }

export function StoreInitializer({ children }: Props) {
  const { initialized, initFromApi } = useStore();
  const { authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const lastRefreshed = useRef<number>(0);
  const location = useLocation();

  // Re-fetch all data, throttled to at most once per REFRESH_COOLDOWN_MS
  const refreshAll = async () => {
    const now = Date.now();
    if (now - lastRefreshed.current < REFRESH_COOLDOWN_MS) return;
    lastRefreshed.current = now;
    try {
      const [proposals, users, templates, catalog, rateCards, lookups] = await Promise.all([
        proposalApi.list(),
        userApi.list(),
        templateApi.list(),
        catalogApi.list(),
        rateCardApi.list(),
        lookupsApi.get(),
      ]) as [Proposal[], User[], Template[], CatalogItem[], RateCard[], AppLookups];
      useStore.setState({ proposals, users, templates, catalog, rateCards, lookups });
    } catch { /* silent background refresh — never break the UI */ }
  };

  // Re-fetch when the tab becomes visible again (user switches back from another tab/app)
  useEffect(() => {
    if (!initialized) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshAll();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [initialized]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch on route change so navigating to Catalog/Users/etc shows fresh data
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
        const [proposals, users, templates, catalog, rateCards, lookups] =
          await Promise.all([
            proposalApi.list(),
            userApi.list(),
            templateApi.list(),
            catalogApi.list(),
            rateCardApi.list(),
            lookupsApi.get(),
          ]) as [Proposal[], User[], Template[], CatalogItem[], RateCard[], AppLookups];

        if (!cancelled) {
          initFromApi({ proposals, users, templates, catalog, rateCards, lookups });
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[StoreInitializer] API unavailable, using seed data:', e);
          // Mark as initialized with seed data so the app still works
          initFromApi(useStore.getState());
          setError(
            import.meta.env.DEV
              ? 'API not running — showing seed data. Start the Functions API on port 7071.'
              : String(e)
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
      {error && import.meta.env.DEV && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-xs text-amber-800 shadow-lg">
          <strong>Dev mode:</strong> {error}
        </div>
      )}
      {children}
    </>
  );
}
