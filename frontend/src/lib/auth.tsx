import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from './api';
import type { SessionData } from './types';

const SESSION_KEY = 'motor.supabase.session';

type AuthContextValue = {
  session: SessionData | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      const current = readStoredSession();
      if (!current?.access_token) {
        if (!cancelled) {
          setSession(null);
          setLoading(false);
        }
        return;
      }

      try {
        const user = await api.getMe(current);
        if (!cancelled) {
          setSession({ ...current, user });
        }
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
        if (!cancelled) setSession(null);
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
    loading,
    isAuthenticated: Boolean(session?.access_token),
    async login(email, password) {
      setLoading(true);
      try {
        const nextSession = await api.login(email, password);
        const user = await api.getMe(nextSession).catch(() => nextSession.user);
        setSession({ ...nextSession, user });
      } finally {
        setLoading(false);
      }
    },
    async logout() {
      try {
        await api.logout(session);
      } catch {
        // noop: session cleanup still happens locally
      }
      setSession(null);
    },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
};

export function RequireAuth({ children }: PropsWithChildren) {
  const auth = useAuth();

  if (auth.loading) return null;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
