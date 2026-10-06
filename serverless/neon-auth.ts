// Vercel bundles api/ and serverless/ as CommonJS while backend/ is an ESM
// package, so backend modules are loaded with dynamic import() (a static import
// would compile to require() of an ES module). Node caches them after the first
// request of a warm instance.
const loadVerifier = () => import('../backend/src/lib/neonJwt.js');
const loadPostgres = () => import('../backend/src/lib/postgres.js');

type NeonUser = {
  id: string;
  email?: string;
  role: string;
};

type NeonProfile = {
  role: 'god_mode' | 'common';
  status: 'active' | 'invited' | 'disabled';
};

type NeonIdentity = {
  user: NeonUser;
  profile: NeonProfile;
};

// Read at call time (not module load) so Vercel env changes and tests apply.
const authBaseUrl = () => String(process.env.NEON_AUTH_BASE_URL ?? '').trim().replace(/\/$/, '');
const jwksUrl = () => String(process.env.NEON_AUTH_JWKS_URL ?? (
  authBaseUrl() ? `${authBaseUrl()}/.well-known/jwks.json` : ''
)).trim();

const databaseUrl = () => (
  process.env.MOTOR_NEON_DATABASE_URL
  || process.env.DATABASE_URL
  || ''
).trim();

const verifyJwt = async (token: string): Promise<NeonUser> => {
  const { verifyNeonAccessToken } = await loadVerifier();
  const claims = await verifyNeonAccessToken(token, { authBaseUrl: authBaseUrl(), jwksUrl: jwksUrl() });
  return { id: claims.id, email: claims.email, role: claims.role };
};

export const verifyActiveIdentity = async (accessToken: string): Promise<NeonIdentity> => {
  const user = await verifyJwt(accessToken);
  const { getNeonPostgresClient } = await loadPostgres();
  const client = getNeonPostgresClient(databaseUrl());
  if (!client) throw Object.assign(new Error('Neon database is not configured.'), { statusCode: 503 });

  const rows = await client.select('user_profiles', {
    select: 'role,status',
    filters: [{ column: 'id', operator: 'eq', value: user.id }],
    limit: 1,
  });
  const profile = rows[0] as { role?: string; status?: string } | undefined;
  if (!profile) throw Object.assign(new Error('User profile not found.'), { statusCode: 403 });
  if (profile.status !== 'active') throw Object.assign(new Error('User access is not active.'), { statusCode: 403 });

  return {
    user,
    profile: {
      role: profile.role === 'god_mode' ? 'god_mode' : 'common',
      status: 'active',
    },
  };
};

export const verifyGodModeIdentity = async (accessToken: string) => {
  const identity = await verifyActiveIdentity(accessToken);
  if (identity.profile.role !== 'god_mode') {
    throw Object.assign(new Error('GOD-MODE access required.'), { statusCode: 403 });
  }
  return identity;
};
