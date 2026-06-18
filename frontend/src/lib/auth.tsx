import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { LoadingState } from '../components/UI';
import { api } from './api';
import type { SessionData } from './types';

type AuthContextValue = {
  session: SessionData | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const sessionFromUser = (user: SessionData['user']): SessionData => ({
  expires_at: Date.now() + 60 * 60 * 1000,
  user,
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      try {
        const user = await api.getMe(null);
        if (!cancelled) {
          setSession(sessionFromUser(user));
        }
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void syncSession();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    isAuthenticated: Boolean(session?.user),
    async login(email, password) {
      setLoading(true);
      try {
        const nextSession = await api.login(email, password);
        const user = await api.getMe(null).catch(() => nextSession.user);
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

  if (auth.loading) return <LoadingState title="Autenticacao" subtitle="Validando sessao Supabase antes de abrir a plataforma." />;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
