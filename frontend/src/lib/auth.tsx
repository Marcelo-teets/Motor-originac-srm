import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { ErrorState, LoadingState } from '../components/UI';
import { api } from './api';
import { neonAuth } from './neonAuth';
import type { UserProfile } from './neonAuth';
import type { SessionData } from './types';

// The access token lives only in memory. The session itself is the HttpOnly
// first-party cookie set by /auth/login, and /auth/session exchanges it for a
// fresh short-lived token on load and before expiry. Nothing a script injected
// into the page could read is persisted.
// Tokens persisted by earlier versions (and the legacy provider) are removed.
const STALE_SESSION_KEYS = ['motor.neon.session', 'motor.supabase.session'];
// Cross-tab login/logout signal. Carries no credential, only the event kind.
const AUTH_SIGNAL_KEY = 'motor.auth.signal';
const REFRESH_WINDOW_MS = 90_000;

const removeStaleSessions = () => {
  try {
    STALE_SESSION_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
};

const broadcastAuthEvent = (kind: 'login' | 'logout') => {
  try {
    window.localStorage.setItem(AUTH_SIGNAL_KEY, `${kind}:${Date.now()}`);
  } catch {
    // Other tabs then catch up on their next refresh.
  }
};

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

const refreshIfNeeded = async (current: SessionData, force = false) => {
  if (!force && current.expires_at > Date.now() + REFRESH_WINDOW_MS) return current;
  return neonAuth.refreshSession();
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  // Every local sign-out/session invalidation advances the epoch. Async auth
  // work that started before that point must never be allowed to restore a
  // token/profile after logout (including logout received from another tab).
  const authEpochRef = useRef(0);

  const hydrateSession = useCallback(async (current: SessionData, expectedEpoch = authEpochRef.current) => {
    const liveUser = await api.getMe(current).catch(() => current.user);
    if (authEpochRef.current !== expectedEpoch) return null;
    const baseSession = { ...current, user: liveUser };
    const nextProfile = await neonAuth.getProfile(baseSession);
    if (authEpochRef.current !== expectedEpoch) return null;
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
    authEpochRef.current += 1;
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      removeStaleSessions();
      try {
        const expectedEpoch = authEpochRef.current;
        const freshSession = await neonAuth.refreshSession();
        if (!cancelled && authEpochRef.current === expectedEpoch) await hydrateSession(freshSession, expectedEpoch);
      } catch (syncError) {
        if (cancelled) return;
        clearLocalSession();
        // Ausência do cookie first-party é o estado normal antes do login;
        // só falhas reais (rede, servidor) viram erro.
        setError(isInvalidSessionError(syncError)
          ? null
          : syncError instanceof Error ? syncError.message : 'Não foi possível validar sua sessão.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void syncSession();
    return () => { cancelled = true; };
  }, [clearLocalSession, hydrateSession, retryToken]);

  const renewSession = useCallback(async (force = true) => {
    const current = session;
    if (!current) return;
    const expectedEpoch = authEpochRef.current;
    try {
      const freshSession = await refreshIfNeeded(current, force);
      if (authEpochRef.current !== expectedEpoch) return;
      await hydrateSession(freshSession, expectedEpoch);
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
    if (!session?.access_token) return;
    const delay = Math.max(1_000, session.expires_at - Date.now() - REFRESH_WINDOW_MS);
    const timer = window.setTimeout(() => { void renewSession(true); }, delay);
    return () => window.clearTimeout(timer);
  }, [renewSession, session?.access_token, session?.expires_at]);

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
      if (event.key !== AUTH_SIGNAL_KEY || !event.newValue) return;
      if (event.newValue.startsWith('logout')) {
        clearLocalSession();
        return;
      }
      // Another tab logged in: the shared cookie now holds that session.
      const expectedEpoch = authEpochRef.current;
      void neonAuth.refreshSession()
        .then((next) => authEpochRef.current === expectedEpoch ? hydrateSession(next, expectedEpoch) : null)
        .catch((syncError) => {
          setError(syncError instanceof Error ? syncError.message : 'Não foi possível sincronizar a sessão.');
        });
    };
    window.addEventListener('storage', syncAcrossTabs);
    return () => window.removeEventListener('storage', syncAcrossTabs);
  }, [clearLocalSession, hydrateSession]);

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
        const expectedEpoch = authEpochRef.current;
        const nextSession = await neonAuth.signInWithPassword(email, password);
        if (authEpochRef.current !== expectedEpoch) return;
        await hydrateSession(nextSession, expectedEpoch);
        if (authEpochRef.current === expectedEpoch) broadcastAuthEvent('login');
      } finally {
        setLoading(false);
      }
    },
    async acceptSession(nextSession) {
      setLoading(true);
      setError(null);
      try {
        const expectedEpoch = authEpochRef.current;
        await hydrateSession(nextSession, expectedEpoch);
        if (authEpochRef.current === expectedEpoch) broadcastAuthEvent('login');
      } finally {
        setLoading(false);
      }
    },
    async refreshProfile() {
      if (!session) return null;
      const expectedEpoch = authEpochRef.current;
      const nextProfile = await neonAuth.getProfile(session);
      if (authEpochRef.current !== expectedEpoch) return null;
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
      const currentSession = session;
      // Invalidate in-flight refresh/profile requests before awaiting the
      // network so they cannot resurrect the session after this logout.
      clearLocalSession();
      broadcastAuthEvent('logout');
      setError(null);
      try {
        await api.logout(currentSession);
      } catch {
        // A limpeza local ocorre mesmo se a revogação remota estiver indisponível.
      }
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

  if (auth.loading) return <LoadingState title="Autenticação" subtitle="Validando sessão Neon antes de abrir a plataforma." />;
  if (auth.error && auth.session?.access_token && !auth.profile) {
    return <ErrorState title="Não foi possível validar a sessão" error={auth.error} action={<button type="button" onClick={auth.retry}>Tentar novamente</button>} />;
  }
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireGodMode({ children }: PropsWithChildren) {
  const auth = useAuth();

  if (auth.loading) return <LoadingState title="Controle de acesso" subtitle="Validando privilégios GOD-MODE no Neon." />;
  if (auth.error && auth.session?.access_token && !auth.profile) {
    return <ErrorState title="Não foi possível validar o acesso" error={auth.error} action={<button type="button" onClick={auth.retry}>Tentar novamente</button>} />;
  }
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  if (!auth.isGodMode) return <Navigate to="/profile" replace />;
  return <>{children}</>;
}
