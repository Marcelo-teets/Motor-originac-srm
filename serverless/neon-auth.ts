import { Pool } from 'pg';

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
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

const encoder = new TextEncoder();
let jwksCache: { expiresAt: number; keys: Jwk[] } | null = null;
let pool: Pool | null = null;
let poolUrl = '';

const authBaseUrl = () => String(process.env.NEON_AUTH_BASE_URL ?? '').replace(/\/$/, '');
const jwksUrl = () => String(process.env.NEON_AUTH_JWKS_URL ?? (
  authBaseUrl() ? `${authBaseUrl()}/.well-known/jwks.json` : ''
)).trim();

const databaseUrl = () => (
  process.env.MOTOR_NEON_DATABASE_URL
  || process.env.DATABASE_URL
  || ''
).trim();

const getPool = () => {
  const url = databaseUrl();
  if (!url) throw Object.assign(new Error('Neon database is not configured.'), { statusCode: 503 });
  if (!pool || poolUrl !== url) {
    pool = new Pool({
      connectionString: url,
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      application_name: 'motor-serverless-auth',
    });
    poolUrl = url;
  }
  return pool;
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return Buffer.from(padded, 'base64');
};

const readJson = async (response: Response) => {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

// Forced refreshes (unknown kid) are throttled so tokens with random kids
// cannot turn every request into a JWKS fetch.
const JWKS_FORCED_REFRESH_INTERVAL_MS = 60_000;
let lastForcedJwksRefreshAt = 0;

const getJwks = async (forceRefresh = false) => {
  const url = jwksUrl();
  if (!url) throw Object.assign(new Error('Neon Auth JWKS is not configured.'), { statusCode: 503 });
  const now = Date.now();
  const canForce = forceRefresh && now - lastForcedJwksRefreshAt >= JWKS_FORCED_REFRESH_INTERVAL_MS;
  if (!canForce && jwksCache && now < jwksCache.expiresAt) return jwksCache.keys;
  if (canForce) lastForcedJwksRefreshAt = now;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw Object.assign(new Error(`Unable to load Neon Auth JWKS: ${response.status}`), { statusCode: 503 });
  const payload = await readJson(response) as { keys?: Jwk[] };
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  if (!keys.length) throw Object.assign(new Error('Neon Auth JWKS is empty.'), { statusCode: 503 });
  jwksCache = { expiresAt: Date.now() + 60 * 60 * 1000, keys };
  return keys;
};

const importVerificationKey = async (jwk: Jwk) => {
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);
  }
  if (jwk.kty === 'RSA') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  if (jwk.kty === 'EC') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  throw Object.assign(new Error(`Unsupported JWT key type: ${jwk.kty ?? 'unknown'}`), { statusCode: 401 });
};

const JWT_CLOCK_SKEW_MS = 60_000;

// A kid missing from the cached JWKS usually means the issuer rotated keys, so
// refetch once before rejecting. Only kid-less tokens fall back to the first key.
const findVerificationKey = async (kid: string | undefined) => {
  if (!kid) {
    const [first] = await getJwks();
    if (!first) throw Object.assign(new Error('No Auth verification key is available.'), { statusCode: 503 });
    return first;
  }
  const cached = (await getJwks()).find((item) => item.kid === kid);
  if (cached) return cached;
  const refreshed = (await getJwks(true)).find((item) => item.kid === kid);
  if (!refreshed) throw Object.assign(new Error('Unknown token signing key.'), { statusCode: 401 });
  return refreshed;
};

const verifyJwt = async (token: string) => {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw Object.assign(new Error('Malformed token.'), { statusCode: 401 });
  }

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(decodeBase64Url(encodedHeader).toString('utf8'));
    payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Malformed token.'), { statusCode: 401 });
  }
  const base = authBaseUrl();
  if (!base) throw Object.assign(new Error('Neon Auth is not configured.'), { statusCode: 503 });
  const expectedOrigin = new URL(base).origin;

  const now = Date.now();
  if (typeof payload.exp !== 'number') {
    throw Object.assign(new Error('Token has no expiry.'), { statusCode: 401 });
  }
  if (payload.exp * 1000 < now) {
    throw Object.assign(new Error('Token expired.'), { statusCode: 401 });
  }
  if (typeof payload.nbf === 'number' && payload.nbf * 1000 > now + JWT_CLOCK_SKEW_MS) {
    throw Object.assign(new Error('Token not yet valid.'), { statusCode: 401 });
  }
  if (payload.iss && payload.iss !== expectedOrigin) {
    throw Object.assign(new Error('Invalid token issuer.'), { statusCode: 401 });
  }
  if (payload.aud) {
    const audiences = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud)];
    if (!audiences.includes(expectedOrigin)) {
      throw Object.assign(new Error('Invalid token audience.'), { statusCode: 401 });
    }
  }

  const jwk = await findVerificationKey(header.kid);

  const key = await importVerificationKey(jwk);
  const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
  const signature = decodeBase64Url(encodedSignature);
  const verified = jwk.kty === 'OKP'
    ? await crypto.subtle.verify('Ed25519', key, signature, data)
    : jwk.kty === 'EC'
      ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, data)
      : await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);

  if (!verified) throw Object.assign(new Error('Invalid token signature.'), { statusCode: 401 });

  const id = typeof payload.sub === 'string' ? payload.sub : '';
  if (!id) throw Object.assign(new Error('JWT subject is missing.'), { statusCode: 401 });
  return {
    id,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    role: typeof payload.role === 'string' ? payload.role : 'authenticated',
  };
};

export const verifyActiveIdentity = async (accessToken: string): Promise<NeonIdentity> => {
  const user = await verifyJwt(accessToken);
  const result = await getPool().query(
    'select role, status from public.user_profiles where id = $1 limit 1',
    [user.id],
  );
  const profile = result.rows[0] as { role?: string; status?: string } | undefined;
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
