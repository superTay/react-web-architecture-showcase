// ============================================================
// auth/AuthContext.tsx — Dual-auth session management  (ILLUSTRATIVE EXTRACT)
// ============================================================
// Sanitized pattern from the production KonquerAI web dashboard. Not
// compiled in this repo — read it for the engineering, not to run it.
// Real table/column names beyond the essentials and product-specific
// profile fields have been trimmed.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// The app authenticates against two backends:
//   1. The provider (Supabase) — issues a JWT, used for RLS-protected reads.
//   2. The automation backend (n8n) — does NOT understand the provider JWT,
//      so it is authenticated with a separate INTERNAL session token
//      (`session_key`) stored in a `user_sessions` table.
// This context owns the lifecycle of that second token: minting it,
// auto-renewing it before expiry, and never letting a transient failure
// overwrite a good user object with a wrong one.
// ============================================================

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase'; // see supabase.example.ts
import { setLoggerUserId, logger } from '../lib/logger';

interface User {
  auth_id: string;
  user_id: string;          // internal id used by the automation backend
  session_key?: string;     // internal token for the automation backend (NOT the JWT)
  name: string;
  email: string;
  token: string;            // provider JWT (access token)
  is_admin: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Races a promise against a timeout. Returns `fallback` if the timeout wins.
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Builds the full user from DB. Returns null (never a partial/wrong user)
  // on auth/network error or timeout, so the caller can PRESERVE the previous
  // correct state instead of clobbering it with a half-built user (wrong
  // user_id, missing session_key → every automation write would then fail).
  const buildUser = async (sess: Session): Promise<User | null> => {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id, display_name, is_admin')
        .eq('auth_user_id', sess.user.id)
        .single();

      // Any error except "no rows" (PGRST116) means auth/network failure.
      if (profileError && profileError.code !== 'PGRST116') return null;

      // No profile row yet (brand-new user): fall back to the auth id so basic
      // auth still works before the profile exists.
      const internalUserId = profile?.user_id ?? sess.user.id;

      const { data: sessionRow } = await supabase
        .from('user_sessions')
        .select('token, expires_at')
        .eq('user_id', internalUserId)
        .maybeSingle();

      // ---- Auto-renew the internal automation token -------------------
      // The provider refreshes its JWT every hour, so this check runs hourly —
      // plenty of margin to renew the internal token before it expires.
      const RENEWAL_MARGIN_MS = 2 * 24 * 60 * 60 * 1000; // renew if <2 days left
      const NEW_TOKEN_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // new token lives 7 days
      const renewalThreshold = new Date(Date.now() + RENEWAL_MARGIN_MS);
      const needsRenewal =
        !sessionRow?.token ||
        !sessionRow.expires_at ||
        new Date(sessionRow.expires_at) < renewalThreshold;

      let activeSessionToken = sessionRow?.token ?? undefined;
      if (needsRenewal) {
        const newToken = `token_${internalUserId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        const newExpiry = new Date(Date.now() + NEW_TOKEN_TTL_MS);
        await supabase
          .from('user_sessions')
          .upsert(
            { user_id: internalUserId, token: newToken, expires_at: newExpiry.toISOString() },
            { onConflict: 'user_id' },
          );
        activeSessionToken = newToken;
      }

      return {
        auth_id: sess.user.id,
        user_id: internalUserId,
        session_key: activeSessionToken,
        name: profile?.display_name ?? sess.user.email?.split('@')[0] ?? 'Usuario',
        email: sess.user.email ?? '',
        token: sess.access_token,
        is_admin: profile?.is_admin ?? false,
      };
    } catch {
      return null; // network/unexpected → signal failure, preserve prior state
    }
  };

  const buildUserSafe = (sess: Session): Promise<User | null> =>
    withTimeout(buildUser(sess), 5000, null);

  // Apply a freshly-built user, or — if buildUser failed — keep the existing
  // user and only patch the JWT so in-flight API calls keep working.
  const applyUserUpdate = (mapped: User | null, newToken: string) => {
    if (mapped !== null) {
      setUser(mapped);
    } else {
      setUser(current => (current ? { ...current, token: newToken } : null));
    }
  };

  useEffect(() => {
    // Safety net: if the auth event never fires, unblock the UI anyway.
    const safetyTimeout = setTimeout(() => setIsLoading(false), 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, sess) => {
        if (!sess) {
          setSession(null);
          setUser(null);
          setIsLoading(false);
          clearTimeout(safetyTimeout);
          return;
        }

        setSession(sess);

        // ---- Subtle bug this guard fixes -----------------------------
        // Reopening a tab after >1h fires INITIAL_SESSION with the EXPIRED
        // access token still in localStorage (refresh hasn't happened yet).
        // DB queries at this point fail SILENTLY (provider returns null data,
        // no throw) → corrupting user_id and session_key. Skip and wait for
        // TOKEN_REFRESHED (~1-2s later). The 8s safety timeout prevents an
        // eternal spinner if refresh never arrives.
        const tokenExpired = sess.expires_at ? sess.expires_at * 1000 <= Date.now() : false;
        if (event === 'INITIAL_SESSION' && tokenExpired) return;

        const mapped = await buildUserSafe(sess);
        applyUserUpdate(mapped, sess.access_token);
        setIsLoading(false);
        clearTimeout(safetyTimeout);
      },
    );

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  // Keep the logger's user id in sync so every log line is attributed.
  useEffect(() => {
    setLoggerUserId(user?.user_id ?? null);
    if (user?.user_id) logger.event('session.start', { is_admin: !!user.is_admin });
  }, [user?.user_id, user?.is_admin]);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { error: 'Email o contraseña incorrectos.' }; // human, never technical
      }
      return { error: error.message };
    }
    if (data.session) {
      setSession(data.session);
      const mapped = await buildUserSafe(data.session);
      applyUserUpdate(mapped, data.session.access_token);
    }
    return { error: null };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
