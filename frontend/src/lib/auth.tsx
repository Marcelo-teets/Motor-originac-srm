import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { ErrorState, LoadingState } from '../components/UI';
import { api } from './api';
import { supabaseAuth } from './supabaseAuth';
import type { UserProfile } from './supabaseAuth';
import type { SessionData } from './types';

const SESSION_KEY = 'motor.supabase.session';
const REFRESH_WINDOW_MS = 90_000;

const isInvalidSessionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /sessão expirou|refresh token|invalid token|jwt expired|token.*expired/i.test(message);
};

type AuthContextValue = {
  session: SessionData | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isGodMode: boolean;
  login: (email: string, password: string) => Promise<void>;
  acceptSession: (session: SessionData) => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  retry: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const readStoredSession = (): SessionData | null => {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionData;
    if (!parsed.access_token || !Number.isFinite(parsed.expires_at)) throw new Error('Sessão local inválida.');
    if (parsed.expires_at <= Date.now() && !parsed.refresh_token) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
};

const refreshIfNeeded = async (current: SessionData, force = false) => {
  if (!force && current.expires_at > Date.now() + REFRESH_WINDOW_MS) return current;
  if (!current.refresh_token) {
    if (current.expires_at <= Date.now()) throw new Error('Sua sessão expirou. Entre novamente.');
    return current;
  }
  return supabaseAuth.refreshSession(current.refresh_token);
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<SessionData | null>(() => readStoredSession());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const hydrateSession = useCallback(async (current: SessionData) => {
    const liveUser = await api.getMe(current).catch(() => current.user);
    const baseSession = { ...current, user: liveUser };
    const nextProfile = await supabaseAuth.getProfile(baseSession);
    if (nextProfile.status !== 'active') {
      throw new Error('Este usuário está desativado. Procure o administrador GOD-MODE.');
    }
    const nextSession = {
      ...baseSession,
      user: {
        ...baseSession.user,
        email: nextProfile.email ?? baseSession.user.email,
        role: nextProfile.role,
      },
    };
    setProfile(nextProfile);
    setSession(nextSession);
    setError(null);
    return nextSession;
  }, []);

  const clearLocalSession = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      const current = readStoredSession();
      if (!current?.access_token) {
        if (!cancelled) {
          setSession(null);
          setProfile(null);
          setError(null);
          setLoading(false);
        }
        return;
      }

      try {
        const freshSession = await refreshIfNeeded(current);
        if (!cancelled) await hydrateSession(freshSession);
      } catch (syncError) {
        if (cancelled) return;
        if (isInvalidSessionError(syncError)) clearLocalSession();
        setError(syncError instanceof Error ? syncError.message : 'Não foi possível validar sua sessão.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void syncSession();
    return () => { cancelled = true; };
  }, [clearLocalSession, hydrateSession, retryToken]);

  useEffect(() => {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  }, [session]);

  const renewSession = useCallback(async (force = true) => {
    const current = session ?? readStoredSession();
    if (!current) return;
    try {
      const freshSession = await refreshIfNeeded(current, force);
      await hydrateSession(freshSession);
    } catch (refreshError) {
      if (isInvalidSessionError(refreshError)) {
        clearLocalSession();
        setError('Sua sessão expirou. Entre novamente.');
      } else {
        setError(refreshError instanceof Error ? refreshError.message : 'Não foi possível renovar a sessão.');
      }
    }
  }, [clearLocalSession, hydrateSession, session]);

  useEffect(() => {
    if (!session?.refresh_token) return;
    const delay = Math.max(1_000, session.expires_at - Date.now() - REFRESH_WINDOW_MS);
    const timer = window.setTimeout(() => { void renewSession(true); }, delay);
    return () => window.clearTimeout(timer);
  }, [renewSession, session?.expires_at, session?.refresh_token]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' && session && session.expires_at <= Date.now() + REFRESH_WINDOW_MS) {
        void renewSession(true);
      }
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [renewSession, session]);

  useEffect(() => {
    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key !== SESSION_KEY) return;
      const next = readStoredSession();
      if (!next) {
        setSession(null);
        setProfile(null);
        return;
      }
      setSession(next);
      void hydrateSession(next).catch((syncError) => {
        setError(syncError instanceof Error ? syncError.message : 'Não foi possível sincronizar a sessão.');
      });
    };
    window.addEventListener('storage', syncAcrossTabs);
    return () => window.removeEventListener('storage', syncAcrossTabs);
  }, [hydrateSession]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    loading,
    error,
    isAuthenticated: Boolean(session?.access_token && profile?.status === 'active'),
    isGodMode: profile?.role === 'god_mode' && profile.status === 'active',
    async login(email, password) {
      setLoading(true);
      setError(null);
      try {
        const nextSession = await supabaseAuth.signInWithPassword(email, password);
        await hydrateSession(nextSession);
      } finally {
        setLoading(false);
      }
    },
    async acceptSession(nextSession) {
      setLoading(true);
      setError(null);
      try {
        await hydrateSession(nextSession);
      } finally {
        setLoading(false);
      }
    },
    async refreshProfile() {
      if (!session) return null;
      const nextProfile = await supabaseAuth.getProfile(session);
      if (nextProfile.status !== 'active') {
        clearLocalSession();
        return nextProfile;
      }
      setProfile(nextProfile);
      setSession((current) => current ? {
        ...current,
        user: { ...current.user, role: nextProfile.role, email: nextProfile.email ?? current.user.email },
      } : current);
      return nextProfile;
    },
    retry() {
      setLoading(true);
      setError(null);
      setRetryToken((current) => current + 1);
    },
    async logout() {
      try {
        await api.logout(session);
      } catch {
        // A limpeza local ocorre mesmo se a revogação remota estiver indisponível.
      }
      clearLocalSession();
      setError(null);
    },
  }), [clearLocalSession, error, hydrateSession, loading, profile, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
};

export function RequireAuth({ children }: PropsWithChildren) {
  const auth = useAuth();

  if (auth.loading) return <LoadingState title="Autenticação" subtitle="Validando sessão Supabase antes de abrir a plataforma." />;
  if (auth.error && auth.session?.access_token && !auth.profile) {
    return <ErrorState title="Não foi possível validar a sessão" error={auth.error} action={<button type="button" onClick={auth.retry}>Tentar novamente</button>} />;
  }
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireGodMode({ children }: PropsWithChildren) {
  const auth = useAuth();

  if (auth.loading) return <LoadingState title="Controle de acesso" subtitle="Validando privilégios GOD-MODE no Supabase." />;
  if (auth.error && auth.session?.access_token && !auth.profile) {
    return <ErrorState title="Não foi possível validar o acesso" error={auth.error} action={<button type="button" onClick={auth.retry}>Tentar novamente</button>} />;
  }
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  if (!auth.isGodMode) return <Navigate to="/profile" replace />;
  return <>{children}</>;
}
