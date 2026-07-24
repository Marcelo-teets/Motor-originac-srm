import type { SessionData } from './types';

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

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');

const supportedOAuthProviders: OAuthProviderOption[] = [
  { provider: 'github', label: 'GitHub', mark: 'GH' },
  { provider: 'google', label: 'Google', mark: 'G' },
];

export const captchaConfig = {
  // O projeto Supabase está com proteção CAPTCHA ativa. O padrão seguro é
  // bloquear o envio sem token; use VITE_CAPTCHA_ENABLED=false apenas quando
  // a proteção também estiver desativada no Supabase Auth.
  enabled: String(import.meta.env.VITE_CAPTCHA_ENABLED ?? 'true').toLowerCase() !== 'false',
  provider: String(import.meta.env.VITE_CAPTCHA_PROVIDER ?? 'turnstile').toLowerCase() === 'hcaptcha' ? 'hcaptcha' as const : 'turnstile' as const,
  siteKey: String(import.meta.env.VITE_CAPTCHA_SITE_KEY ?? ''),
};

const requireConfig = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase não está configurado no frontend. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }
};

const authHeaders = (accessToken?: string) => ({
  apikey: supabaseAnonKey,
  'Content-Type': 'application/json',
  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
});

const readPayload = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return { message: text };
  }
};

const authError = (payload: Record<string, any>, fallback: string) => {
  const code = String(payload.error_code ?? payload.code ?? '');
  const message = String(payload.error_description ?? payload.msg ?? payload.message ?? payload.error ?? fallback);
  if (code === 'captcha_failed' || /captcha/i.test(message)) {
    return new Error('A proteção CAPTCHA está ativa. Conclua o desafio de segurança antes de continuar. Se o desafio não aparecer, configure VITE_CAPTCHA_SITE_KEY na Vercel.');
  }
  if (/invalid login credentials/i.test(message)) return new Error('E-mail ou senha inválidos.');
  return new Error(message || fallback);
};

const fetchAuthUser = async (accessToken: string) => {
  requireConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: authHeaders(accessToken) });
  const payload = await readPayload(response);
  if (!response.ok) throw authError(payload, 'Não foi possível validar o usuário.');
  return payload;
};

const buildSession = async (payload: Record<string, any>): Promise<SessionData> => {
  const accessToken = String(payload.access_token ?? '');
  if (!accessToken) throw new Error('A autenticação não retornou um token de acesso válido.');
  const user = payload.user ?? await fetchAuthUser(accessToken);
  return {
    access_token: accessToken,
    refresh_token: typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined,
    expires_at: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
    user: {
      id: String(user.id ?? user.sub ?? ''),
      email: typeof user.email === 'string' ? user.email : undefined,
      role: 'common',
    },
  };
};

const captchaBody = (captchaToken?: string) => (captchaToken ? { captcha_token: captchaToken } : {});

export const supabaseAuth = {
  async signInWithPassword(email: string, password: string, captchaToken?: string) {
    requireConfig();
    if (captchaConfig.enabled && !captchaToken) throw new Error('Conclua o CAPTCHA para entrar.');
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, password, ...captchaBody(captchaToken) }),
    });
    const payload = await readPayload(response);
    if (!response.ok) throw authError(payload, 'Falha ao autenticar.');
    return buildSession(payload);
  },

  async sendPasswordRecovery(email: string, captchaToken?: string) {
    requireConfig();
    if (captchaConfig.enabled && !captchaToken) throw new Error('Conclua o CAPTCHA para recuperar a senha.');
    const redirectTo = `${window.location.origin}/reset-password`;
    const response = await fetch(`${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, ...captchaBody(captchaToken) }),
    });
    const payload = await readPayload(response);
    if (!response.ok) throw authError(payload, 'Não foi possível enviar o e-mail de recuperação.');
  },

  async updatePassword(accessToken: string, password: string) {
    requireConfig();
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ password }),
    });
    const payload = await readPayload(response);
    if (!response.ok) throw authError(payload, 'Não foi possível alterar a senha.');
    return payload;
  },

  async getEnabledOAuthProviders(): Promise<OAuthProviderOption[]> {
    requireConfig();
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { ...authHeaders(), Accept: 'application/json' },
    });
    const payload = await readPayload(response);
    if (!response.ok) throw authError(payload, 'Não foi possível consultar os provedores OAuth.');
    const external = payload.external && typeof payload.external === 'object'
      ? payload.external as Record<string, unknown>
      : {};
    return supportedOAuthProviders.filter(({ provider }) => external[provider] === true);
  },

  getOAuthUrl(provider: OAuthProvider) {
    requireConfig();
    const redirectTo = `${window.location.origin}/auth/callback`;
    return `${supabaseUrl}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(redirectTo)}`;
  },

  async sessionFromLocation(): Promise<SessionData> {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const errorDescription = hash.get('error_description') ?? query.get('error_description') ?? hash.get('error') ?? query.get('error');
    if (errorDescription) throw new Error(decodeURIComponent(errorDescription));
    return buildSession({
      access_token: hash.get('access_token') ?? query.get('access_token'),
      refresh_token: hash.get('refresh_token') ?? query.get('refresh_token'),
      expires_in: hash.get('expires_in') ?? query.get('expires_in') ?? 3600,
    });
  },

  async getProfile(session: SessionData): Promise<UserProfile> {
    requireConfig();
    const response = await fetch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${encodeURIComponent(session.user.id)}&select=*`, {
      headers: { ...authHeaders(session.access_token), Accept: 'application/json' },
    });
    const payload = await readPayload(response);
    if (!response.ok) throw authError(payload, 'Não foi possível carregar o perfil.');
    const profile = Array.isArray(payload) ? payload[0] : undefined;
    if (!profile) throw new Error('Perfil de usuário não encontrado.');
    return profile as UserProfile;
  },

  async updateProfile(session: SessionData, changes: Pick<UserProfile, 'full_name' | 'job_title' | 'phone' | 'avatar_url' | 'timezone' | 'locale'>): Promise<UserProfile> {
    requireConfig();
    const response = await fetch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${encodeURIComponent(session.user.id)}&select=*`, {
      method: 'PATCH',
      headers: { ...authHeaders(session.access_token), Prefer: 'return=representation' },
      body: JSON.stringify(changes),
    });
    const payload = await readPayload(response);
    if (!response.ok) throw authError(payload, 'Não foi possível salvar o perfil.');
    return (Array.isArray(payload) ? payload[0] : payload) as UserProfile;
  },

  async listUsers(session: SessionData): Promise<UserProfile[]> {
    requireConfig();
    const response = await fetch(`${supabaseUrl}/rest/v1/user_profiles?select=*&order=created_at.asc`, {
      headers: authHeaders(session.access_token),
    });
    const payload = await readPayload(response);
    if (!response.ok) throw authError(payload, 'Não foi possível listar os usuários.');
    return (Array.isArray(payload) ? payload : []) as UserProfile[];
  },

  async setUserAccess(session: SessionData, userId: string, role: UserRole, status: UserStatus): Promise<UserProfile> {
    requireConfig();
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/set_user_access`, {
      method: 'POST',
      headers: authHeaders(session.access_token),
      body: JSON.stringify({ target_user_id: userId, new_role: role, new_status: status }),
    });
    const payload = await readPayload(response);
    if (!response.ok) throw authError(payload, 'Não foi possível atualizar o acesso do usuário.');
    return (Array.isArray(payload) ? payload[0] : payload) as UserProfile;
  },
};
