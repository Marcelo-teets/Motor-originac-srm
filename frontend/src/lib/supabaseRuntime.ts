import publicAuthConfig from '../../public-auth.config.json';
import type { SessionData } from './types';

export const supabaseRuntimeUrl = String(
  import.meta.env.VITE_SUPABASE_URL
  ?? publicAuthConfig.supabaseUrl
  ?? '',
).replace(/\/$/, '');

export const supabaseRuntimeKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? publicAuthConfig.supabasePublishableKey
  ?? '',
);

export function requireSupabaseRuntime(session: SessionData | null, feature: string) {
  if (!supabaseRuntimeUrl || !supabaseRuntimeKey) {
    throw new Error(`${feature} requer a configuração pública do Supabase.`);
  }
  if (!session?.access_token) {
    throw new Error(`Sessão autenticada necessária para ${feature.toLowerCase()}.`);
  }
  return {
    url: supabaseRuntimeUrl,
    key: supabaseRuntimeKey,
    accessToken: session.access_token,
  };
}

export function supabaseRuntimeHeaders(session: SessionData | null, feature: string) {
  const runtime = requireSupabaseRuntime(session, feature);
  return {
    runtime,
    headers: {
      apikey: runtime.key,
      Authorization: `Bearer ${runtime.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
}
