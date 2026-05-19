import React, {
  createContext, useContext, useState, useEffect, useCallback,
} from 'react';
import type { User } from '../types';
import { useStore } from '../store';
import { api, authApi } from '../lib/api';

// ─── Permission helper ────────────────────────────────────────────────────────

export function isPresalesAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.appRole === 'admin';
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  currentUser: User | null;
  authLoading: boolean;
  /** Returns { requireTotp, challengeToken } if TOTP is needed, or void on success */
  login: (email: string, password: string, preVerified?: { preVerified: true; token: string; user: User }) => Promise<{ requireTotp: true; challengeToken: string } | void>;
  loginWithSamlCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Update the in-memory current user (e.g. after profile save) */
  refreshCurrentUser: (updated: User) => void;
  /** Dev-only: switch the active mock user */
  signIn: (userId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const IS_DEV = import.meta.env.DEV;

  // ── Dev mock path ────────────────────────────────────────────────────────────
  const [mockUserId, setMockUserId] = useState<string>(''); // start logged out
  const users = useStore(s => s.users);
  const mockUser = users.find(u => u.id === mockUserId) ?? null;

  // ── Production path ──────────────────────────────────────────────────────────
  const [prodUser, setProdUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(!IS_DEV);

  const loadProdUser = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setAuthLoading(false);
      return;
    }
    try {
      const user = await api.get<User | null>('me');
      if (user) {
        setProdUser(user);
        const { updateUser, addUser, users: storeUsers } = useStore.getState();
        if (storeUsers.find(u => u.id === user.id)) {
          updateUser(user.id, user);
        } else {
          addUser(user);
        }
      } else {
        // Token invalid or expired — clear it
        localStorage.removeItem('auth_token');
      }
    } catch {
      localStorage.removeItem('auth_token');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!IS_DEV) loadProdUser();
  }, [IS_DEV, loadProdUser]);

  // ── Auth actions ─────────────────────────────────────────────────────────────

  const login = async (
    email: string,
    password: string,
    preVerified?: { preVerified: true; token: string; user: User },
  ): Promise<{ requireTotp: true; challengeToken: string } | void> => {
    // Pre-verified path: TOTP was already checked in Login.tsx
    if (preVerified) {
      localStorage.setItem('auth_token', preVerified.token);
      setProdUser(preVerified.user);
      const { updateUser, addUser, users: storeUsers } = useStore.getState();
      if (storeUsers.find(u => u.id === preVerified.user.id)) updateUser(preVerified.user.id, preVerified.user);
      else addUser(preVerified.user);
      return;
    }

    const result = await authApi.login(email, password) as
      | { token: string; user: User }
      | { requireTotp: true; challengeToken: string };

    if ('requireTotp' in result) return result;

    localStorage.setItem('auth_token', result.token);
    setProdUser(result.user);
    const { updateUser, addUser, users: storeUsers } = useStore.getState();
    if (storeUsers.find(u => u.id === result.user.id)) updateUser(result.user.id, result.user);
    else addUser(result.user);
  };

  const loginWithSamlCode = async (code: string) => {
    const { token, user } = await authApi.exchangeSaml(code);
    localStorage.setItem('auth_token', token);
    setProdUser(user);
    const { updateUser, addUser, users: storeUsers } = useStore.getState();
    if (storeUsers.find(u => u.id === user.id)) {
      updateUser(user.id, user);
    } else {
      addUser(user);
    }
  };

  const logout = async () => {
    if (IS_DEV) {
      setMockUserId('');
      return;
    }
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem('auth_token');
    setProdUser(null);
  };

  // ── Dev-only mock switcher ───────────────────────────────────────────────────

  const signIn = (userId: string) => {
    if (IS_DEV) setMockUserId(userId);
  };

  const refreshCurrentUser = (updated: User) => {
    setProdUser(updated);
    const { updateUser } = useStore.getState();
    updateUser(updated.id, updated);
  };

  const currentUser = IS_DEV ? mockUser : prodUser;

  return (
    <AuthContext.Provider value={{ currentUser, authLoading, login, loginWithSamlCode, logout, refreshCurrentUser, signIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
