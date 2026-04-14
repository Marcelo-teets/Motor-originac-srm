import type { AuthUser } from './auth.js';
import { getSupabaseClient } from './supabase.js';

const syncCache = new Map<string, number>();
const SYNC_TTL_MS = 300000;

const getFullName = (user: AuthUser) => {
  const raw = user.raw ?? {};
  const metadata = typeof raw.user_metadata === 'object' && raw.user_metadata ? raw.user_metadata as Record<string, unknown> : {};
  if (typeof metadata.full_name === 'string' && metadata.full_name.trim()) return metadata.full_name;
  if (typeof raw.name === 'string' && raw.name.trim()) return raw.name;
  return null;
};

export const ensureApplicationUser = async (user: AuthUser | undefined) => {
  if (!user?.id) return false;
  const lastSyncedAt = syncCache.get(user.id) ?? 0;
  if (Date.now() - lastSyncedAt < SYNC_TTL_MS) return true;

  const client = getSupabaseClient();
  if (!client) return false;

  await client.upsert('users', [{
    id: user.id,
    email: user.email ?? null,
    full_name: getFullName(user),
    role: user.role ?? 'authenticated',
    auth_provider: 'supabase_auth',
    updated_at: new Date().toISOString()
  }], 'id');

  syncCache.set(user.id, Date.now());
  return true;
};
