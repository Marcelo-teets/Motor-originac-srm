import type { AuthUser } from './auth.js';
import { getDataClient } from './supabase.js';

export type UserRole = 'god_mode' | 'common';
export type UserStatus = 'active' | 'invited' | 'disabled';

export type UserProfileRecord = {
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

const client = () => {
  const configured = getDataClient();
  if (!configured) throw new Error('Persistent database is required for user profiles.');
  return configured;
};

const normalizedProfile = (row: Record<string, unknown>): UserProfileRecord => ({
  id: String(row.id ?? ''),
  email: typeof row.email === 'string' ? row.email : null,
  full_name: typeof row.full_name === 'string' ? row.full_name : null,
  role: row.role === 'god_mode' ? 'god_mode' : 'common',
  status: row.status === 'disabled' ? 'disabled' : row.status === 'invited' ? 'invited' : 'active',
  job_title: typeof row.job_title === 'string' ? row.job_title : null,
  phone: typeof row.phone === 'string' ? row.phone : null,
  avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
  timezone: typeof row.timezone === 'string' ? row.timezone : 'America/Sao_Paulo',
  locale: typeof row.locale === 'string' ? row.locale : 'pt-BR',
  metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {},
  created_at: String(row.created_at ?? new Date().toISOString()),
  updated_at: String(row.updated_at ?? new Date().toISOString()),
});

export const getUserProfileById = async (userId: string) => {
  const rows = await client().select('user_profiles', {
    filters: [{ column: 'id', operator: 'eq', value: userId }],
    limit: 1,
  }) as Record<string, unknown>[];
  return rows[0] ? normalizedProfile(rows[0]) : null;
};

export const ensureUserProfile = async (user: AuthUser, defaults: { role?: UserRole; status?: UserStatus; fullName?: string | null } = {}) => {
  const existing = await getUserProfileById(user.id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const rows = await client().insert('user_profiles', [{
    id: user.id,
    email: user.email ?? '',
    full_name: defaults.fullName ?? (typeof user.raw.name === 'string' ? user.raw.name : null),
    role: defaults.role ?? 'common',
    status: defaults.status ?? 'invited',
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
    metadata: {
      auth_provider: 'neon',
      provisioned_by: defaults.role === 'god_mode' ? 'initial_bootstrap' : 'jit_profile',
    },
    created_at: now,
    updated_at: now,
  }]) as Record<string, unknown>[];

  if (!rows[0]) throw new Error('Unable to create application user profile.');
  return normalizedProfile(rows[0]);
};

export const updateOwnUserProfile = async (
  userId: string,
  changes: Pick<UserProfileRecord, 'full_name' | 'job_title' | 'phone' | 'avatar_url' | 'timezone' | 'locale'>,
) => {
  const rows = await client().update('user_profiles', {
    full_name: changes.full_name,
    job_title: changes.job_title,
    phone: changes.phone,
    avatar_url: changes.avatar_url,
    timezone: changes.timezone,
    locale: changes.locale,
    updated_at: new Date().toISOString(),
  }, [{ column: 'id', operator: 'eq', value: userId }]) as Record<string, unknown>[];
  if (!rows[0]) throw new Error('User profile not found.');
  return normalizedProfile(rows[0]);
};

export const requireGodModeProfile = async (userId: string) => {
  const profile = await getUserProfileById(userId);
  if (!profile || profile.role !== 'god_mode' || profile.status !== 'active') {
    throw Object.assign(new Error('god_mode_required'), { statusCode: 403 });
  }
  return profile;
};

export const hasActiveGodModeProfile = async () => {
  const rows = await client().select('user_profiles', {
    filters: [
      { column: 'role', operator: 'eq', value: 'god_mode' },
      { column: 'status', operator: 'eq', value: 'active' },
    ],
    limit: 1,
  }) as Record<string, unknown>[];
  return rows.length > 0;
};

export const listUserProfiles = async () => {
  const rows = await client().select('user_profiles', {
    orderBy: { column: 'created_at', ascending: true },
  }) as Record<string, unknown>[];
  return rows.map(normalizedProfile);
};

export const setUserAccess = async (
  actorId: string,
  targetUserId: string,
  role: UserRole,
  status: UserStatus,
) => {
  await requireGodModeProfile(actorId);
  if (targetUserId === actorId && (role !== 'god_mode' || status !== 'active')) {
    throw Object.assign(new Error('god_mode_self_lockout_forbidden'), { statusCode: 409 });
  }
  if (role === 'god_mode' && targetUserId !== actorId) {
    throw Object.assign(new Error('single_god_mode_enforced'), { statusCode: 409 });
  }

  const rows = await client().update('user_profiles', {
    role,
    status,
    updated_at: new Date().toISOString(),
  }, [{ column: 'id', operator: 'eq', value: targetUserId }]) as Record<string, unknown>[];
  if (!rows[0]) throw Object.assign(new Error('user_profile_not_found'), { statusCode: 404 });
  return normalizedProfile(rows[0]);
};
