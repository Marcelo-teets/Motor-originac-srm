import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionData } from './types';

const SESSION_KEY = 'motor.supabase.session';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

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
  const [loading, setLoading] = useState(false);

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
      if (!supabaseUrl || !supabaseAnonKey) throw new Error('VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórios no frontend.');
      setLoading(true);
      try {
        const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error_description ?? payload.msg ?? 'Falha no login com Supabase.');
        setSession({
          access_token: payload.access_token,
          refresh_token: payload.refresh_token,
          expires_at: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
          user: {
            id: payload.user?.id,
            email: payload.user?.email,
            role: payload.user?.role ?? payload.user?.app_metadata?.role ?? 'authenticated',
          },
        });
      } finally {
        setLoading(false);
      }
    },
    async logout() {
      if (session?.access_token && supabaseUrl && supabaseAnonKey) {
        await fetch(`${supabaseUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${session.access_token}`,
          },
        }).catch(() => undefined);
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
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.loading && !auth.isAuthenticated) navigate('/login', { replace: true });
  }, [auth.isAuthenticated, auth.loading, navigate]);

  if (!auth.isAuthenticated) return null;
  return <>{children}</>;
}
