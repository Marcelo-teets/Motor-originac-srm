import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { LoadingState } from '../components/UI';
import { api } from './api';
import { supabaseAuth } from './supabaseAuth';
import type { UserProfile } from './supabaseAuth';
import type { SessionData } from './types';

const SESSION_KEY = 'motor.supabase.session';

type AuthContextValue = {
  session: SessionData | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  isGodMode: boolean;
  login: (email: string, password: string, captchaToken?: string) => Promise<void>;
  acceptSession: (session: SessionData) => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const readStoredSession = (): SessionData | null => {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionData;
    if (parsed.expires_at <= Date.now()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<SessionData | null>(() => readStoredSession());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrateSession = async (current: SessionData) => {
    const liveUser = await api.getMe(current).catch(() => current.user);
    const baseSession = { ...current, user: liveUser };
    const nextProfile = await supabaseAuth.getProfile(baseSession).catch(() => null);
    if (nextProfile && nextProfile.status !== 'active') {
      throw new Error('Este usuário está desativado. Procure o administrador GOD-MODE.');
    }
    const nextSession = nextProfile
      ? { ...baseSession, user: { ...baseSession.user, email: nextProfile.email ?? baseSession.user.email, role: nextProfile.role } }
      : baseSession;
    setProfile(nextProfile);
    setSession(nextSession);
    return nextSession;
  };

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      const current = readStoredSession();
      if (!current?.access_token) {
        if (!cancelled) {
          setSession(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      try {
        if (!cancelled) await hydrateSession(current);
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
        if (!cancelled) {
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void syncSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (session) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    loading,
    isAuthenticated: Boolean(session?.access_token && profile?.status === 'active'),
    isGodMode: profile?.role === 'god_mode' && profile.status === 'active',
    async login(email, password, captchaToken) {
      setLoading(true);
      try {
        const nextSession = await supabaseAuth.signInWithPassword(email, password, captchaToken);
        await hydrateSession(nextSession);
      } finally {
        setLoading(false);
      }
    },
    async acceptSession(nextSession) {
      setLoading(true);
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
        setSession(null);
        setProfile(null);
        return nextProfile;
      }
      setProfile(nextProfile);
      setSession((current) => current ? { ...current, user: { ...current.user, role: nextProfile.role, email: nextProfile.email ?? current.user.email } } : current);
      return nextProfile;
    },
    async logout() {
      try {
        await api.logout(session);
      } catch {
        // A limpeza local ocorre mesmo se a revogação remota estiver indisponível.
      }
      setSession(null);
      setProfile(null);
    },
  }), [loading, profile, session]);

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
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireGodMode({ children }: PropsWithChildren) {
  const auth = useAuth();

  if (auth.loading) return <LoadingState title="Controle de acesso" subtitle="Validando privilégios GOD-MODE no Supabase." />;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  if (!auth.isGodMode) return <Navigate to="/profile" replace />;
  return <>{children}</>;
}
