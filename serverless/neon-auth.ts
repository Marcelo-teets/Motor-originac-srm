// Vercel bundles api/ and serverless/ as CommonJS while backend/ is an ESM
// package, so backend modules are loaded with dynamic import() (a static import
// would compile to require() of an ES module). Node caches them after the first
// request of a warm instance.
const loadVerifier = () => import('../backend/src/lib/neonJwt.js');
const loadPostgres = () => import('../backend/src/lib/postgres.js');
const loadIdentityPolicy = () => import('../backend/src/lib/institutionalIdentity.js');

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

  const rows = await client.query<{
    role: string; status: string; profile_email: string | null;
    auth_email: string | null; email_verified: boolean; auth_banned: boolean | null;
  }>(`select p.role, p.status, p.email as profile_email,
           a.email as auth_email, a."emailVerified" as email_verified,
           a.banned as auth_banned
       from public.user_profiles p
       join neon_auth."user" a on a.id = p.id
       where p.id = $1
       limit 1`, [user.id]);
  const profile = rows[0];
  const { hasVerifiedTokenIdentity } = await loadIdentityPolicy();
  if (!profile || profile.status !== 'active' ||
    !hasVerifiedTokenIdentity(user.email, profile.profile_email, profile.auth_email,
      profile.email_verified, profile.auth_banned)) {
    throw Object.assign(new Error('Institutional identity is unverified or inactive.'), { statusCode: 403 });
  }

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
