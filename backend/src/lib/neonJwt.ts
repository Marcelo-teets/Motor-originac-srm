/**
 * Single Neon Managed Auth access-token verifier, shared by the Express backend
 * (backend/src/lib/auth.ts) and the standalone Vercel functions
 * (serverless/neon-auth.ts). It is intentionally free of env/DB imports so both
 * runtimes can pass their own configuration.
 */
type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

export type NeonJwtConfig = {
  /** Neon Auth base URL; its origin is the expected `iss`/`aud`. */
  authBaseUrl: string;
  jwksUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export type NeonJwtClaims = {
  id: string;
  email?: string;
  role: string;
  payload: Record<string, unknown>;
};

export class NeonJwtError extends Error {
  constructor(message: string, readonly statusCode = 401) {
    super(message);
    this.name = 'NeonJwtError';
  }
}

const JWKS_TTL_MS = 60 * 60 * 1000;
// A token signed by a key we have not seen triggers one JWKS refresh (key
// rotation), but never more than once per minute per JWKS URL.
const JWKS_FORCED_REFRESH_COOLDOWN_MS = 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

const encoder = new TextEncoder();
const jwksCache = new Map<string, { expiresAt: number; keys: Jwk[] }>();
const lastForcedRefreshAt = new Map<string, number>();

export const resetNeonJwksCache = () => {
  jwksCache.clear();
  lastForcedRefreshAt.clear();
};

export const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return Buffer.from(padded, 'base64');
};

const decodeJsonSegment = (segment: string, label: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(segment).toString('utf8'));
  } catch {
    throw new NeonJwtError(`Malformed token ${label}.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new NeonJwtError(`Malformed token ${label}.`);
  }
  return parsed as Record<string, unknown>;
};

const fetchJwks = async (config: NeonJwtConfig, now: number) => {
  const fetchImpl = config.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(config.jwksUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw new NeonJwtError(`Unable to load Neon Auth JWKS: ${error instanceof Error ? error.message : String(error)}`, 503);
  }
  if (!response.ok) throw new NeonJwtError(`Unable to load Neon Auth JWKS: ${response.status}`, 503);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new NeonJwtError('Neon Auth JWKS is not valid JSON.', 503);
  }
  const keys = Array.isArray((payload as { keys?: unknown })?.keys) ? (payload as { keys: Jwk[] }).keys : [];
  if (!keys.length) throw new NeonJwtError('Neon Auth JWKS is empty.', 503);
  jwksCache.set(config.jwksUrl, { expiresAt: now + JWKS_TTL_MS, keys });
  return keys;
};

const loadJwks = async (config: NeonJwtConfig, now: number, forceRefresh = false) => {
  const cached = jwksCache.get(config.jwksUrl);
  if (cached && now < cached.expiresAt) {
    if (!forceRefresh) return cached.keys;
    const lastForced = lastForcedRefreshAt.get(config.jwksUrl);
    if (lastForced !== undefined && now - lastForced < JWKS_FORCED_REFRESH_COOLDOWN_MS) return cached.keys;
  }
  if (forceRefresh) lastForcedRefreshAt.set(config.jwksUrl, now);
  return fetchJwks(config, now);
};

type Verifier = {
  importParams: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams;
  verifyParams: AlgorithmIdentifier | EcdsaParams;
};

const verifierFor = (alg: string, jwk: Jwk): Verifier | null => {
  if (alg === 'EdDSA' && jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    return { importParams: { name: 'Ed25519' }, verifyParams: { name: 'Ed25519' } };
  }
  if (alg === 'RS256' && jwk.kty === 'RSA') {
    return {
      importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
    };
  }
  if (alg === 'ES256' && jwk.kty === 'EC' && jwk.crv === 'P-256') {
    return { importParams: { name: 'ECDSA', namedCurve: 'P-256' }, verifyParams: { name: 'ECDSA', hash: 'SHA-256' } };
  }
  if (alg === 'ES384' && jwk.kty === 'EC' && jwk.crv === 'P-384') {
    return { importParams: { name: 'ECDSA', namedCurve: 'P-384' }, verifyParams: { name: 'ECDSA', hash: 'SHA-384' } };
  }
  return null;
};

const selectKey = async (config: NeonJwtConfig, now: number, kid: string | undefined, alg: string) => {
  const compatible = (keys: Jwk[]) => keys.find((key) => (kid ? key.kid === kid : true) && verifierFor(alg, key));
  let jwk = compatible(await loadJwks(config, now));
  if (!jwk && kid) jwk = compatible(await loadJwks(config, now, true));
  if (!jwk) throw new NeonJwtError(kid ? 'Unknown token signing key.' : 'No compatible token signing key.');
  return jwk;
};

const audiencesOf = (aud: unknown) => (Array.isArray(aud) ? aud.map(String) : [String(aud)]);

export const verifyNeonAccessToken = async (token: string, config: NeonJwtConfig): Promise<NeonJwtClaims> => {
  if (!config.authBaseUrl || !config.jwksUrl) {
    throw new NeonJwtError('Neon Managed Auth environment is not configured. Set NEON_AUTH_BASE_URL.', 503);
  }

  const parts = String(token ?? '').split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new NeonJwtError('Malformed token.');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = decodeJsonSegment(encodedHeader, 'header');
  const payload = decodeJsonSegment(encodedPayload, 'payload');
  const alg = typeof header.alg === 'string' ? header.alg : '';
  if (!alg || alg === 'none') throw new NeonJwtError('Unsupported token algorithm.');

  const now = (config.now ?? Date.now)();
  const nowSeconds = now / 1000;
  const expectedOrigin = new URL(config.authBaseUrl).origin;

  if (typeof payload.exp !== 'number') throw new NeonJwtError('Token expiry is missing.');
  if (payload.exp + CLOCK_SKEW_SECONDS < nowSeconds) throw new NeonJwtError('Token expired.');
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > nowSeconds) {
    throw new NeonJwtError('Token is not valid yet.');
  }
  if (payload.iss !== undefined && payload.iss !== expectedOrigin) throw new NeonJwtError('Invalid token issuer.');
  if (payload.aud !== undefined && !audiencesOf(payload.aud).includes(expectedOrigin)) {
    throw new NeonJwtError('Invalid token audience.');
  }

  const jwk = await selectKey(config, now, typeof header.kid === 'string' ? header.kid : undefined, alg);
  const verifier = verifierFor(alg, jwk)!;
  let verified = false;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, verifier.importParams, false, ['verify']);
    verified = await crypto.subtle.verify(
      verifier.verifyParams,
      key,
      decodeBase64Url(encodedSignature),
      encoder.encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    verified = false;
  }
  if (!verified) throw new NeonJwtError('Invalid token signature.');

  const id = typeof payload.sub === 'string' ? payload.sub : '';
  if (!id) throw new NeonJwtError('JWT subject is missing.');

  return {
    id,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    role: typeof payload.role === 'string' ? payload.role : 'authenticated',
    payload,
  };
};
