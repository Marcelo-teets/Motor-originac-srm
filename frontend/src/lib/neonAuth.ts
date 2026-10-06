import type { SessionData } from './types';
import { fetchWithPolicy } from './http';
import { buildApiUrl } from './runtimeConfig';

export type UserRole = 'god_mode' | 'common';
export type UserStatus = 'active' | 'invited' | 'disabled';
export type OAuthProvider = 'github' | 'google';

export type OAuthProviderOption = {
  provider: OAuthProvider;
  label: string;
  mark: string;
};

export type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  status: UserStatus;
  job_title: string | null;
  phone: string | null;
  avatar_url: string | null;
  timezone: string;
  locale: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type Envelope<T> = {
  status: 'real' | 'partial' | 'mock';
  generatedAt?: string;
  data: T;
  error?: string;
};

const readPayload = async <T>(response: Response): Promise<Envelope<T>> => {
  const text = await response.text();
  if (!text) {
    return {
      status: 'partial',
      data: undefined as T,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  }
  try {
    return JSON.parse(text) as Envelope<T>;
  } catch {
    throw new Error('O serviço de autenticação retornou uma resposta inválida.');
  }
};

const authError = (payload: { error?: string }, fallback: string) => {
  const message = String(payload.error ?? fallback);
  if (/invalid email or password|e-mail ou senha inválidos/i.test(message)) return new Error('E-mail ou senha inválidos.');
  if (/rate limit|muitas tentativas/i.test(message)) return new Error('Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.');
  if (/sessão|session|token/i.test(message) && /expir|invalid|not found|não encontrada/i.test(message)) {
    return new Error('Sua sessão expirou. Entre novamente.');
  }
  return new Error(message || fallback);
};

const request = async <T>(
  path: string,
  init: RequestInit = {},
  session?: SessionData | null,
): Promise<T> => {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  const response = await fetchWithPolicy(buildApiUrl(path), {
    ...init,
    headers,
    credentials: 'include',
  }, { timeoutMs: 15_000, retries: 1 });
  const payload = await readPayload<T>(response);
  if (!response.ok) throw authError(payload, `Falha de autenticação (HTTP ${response.status}).`);
  return payload.data;
};

export const neonAuth = {
  async getBootstrapStatus() {
    return request<{ provider: 'neon'; enabled: boolean; available: boolean; initialized: boolean }>('/auth/bootstrap-status');
  },

  async signUpWithPassword(name: string, email: string, password: string) {
    return request<{ registered: boolean; status: UserStatus }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  },

  async bootstrapInitialUser(name: string, email: string, password: string) {
    return request<SessionData>('/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  },

  async signInWithPassword(email: string, password: string) {
    return request<SessionData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async refreshSession() {
    return request<SessionData>('/auth/session', { method: 'POST' });
  },

  async sendPasswordRecovery(email: string) {
    await request<{ accepted: boolean }>('/auth/password/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string) {
    await request<{ success: boolean }>('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },

  async changePassword(session: SessionData, currentPassword: string, newPassword: string) {
    await request<{ success: boolean }>('/auth/password/change', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }, session);
  },

  async getEnabledOAuthProviders(): Promise<OAuthProviderOption[]> {
    // OAuth remains intentionally hidden until its callback also terminates on
    // the first-party Motor domain. Email/password already runs fully on Neon.
    return [];
  },

  getOAuthUrl(_provider: OAuthProvider) {
    throw new Error('OAuth ainda não está habilitado no proxy first-party do Motor.');
  },

  async sessionFromLocation(): Promise<SessionData> {
    return this.refreshSession();
  },

  async getProfile(session: SessionData): Promise<UserProfile> {
    return request<UserProfile>('/auth/profile', {}, session);
  },

  async updateProfile(
    session: SessionData,
    changes: Pick<UserProfile, 'full_name' | 'job_title' | 'phone' | 'avatar_url' | 'timezone' | 'locale'>,
  ): Promise<UserProfile> {
    return request<UserProfile>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }, session);
  },

  async listUsers(session: SessionData): Promise<UserProfile[]> {
    return request<UserProfile[]>('/auth/users', {}, session);
  },

  async setUserAccess(
    session: SessionData,
    userId: string,
    role: UserRole,
    status: UserStatus,
  ): Promise<UserProfile> {
    return request<UserProfile>(`/auth/users/${encodeURIComponent(userId)}/access`, {
      method: 'PATCH',
      body: JSON.stringify({ role, status }),
    }, session);
  },
};
