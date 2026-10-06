import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import { env } from './env.js';

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
export type AuthUser = { id: string; email?: string; role?: string; raw: Record<string, unknown> };
export type AuthSession = {
  access_token: string;
  expires_at: number;
  user: { id: string; email?: string; role?: string };
};
export type AuthFlowResult = {
  sessionToken: string;
  session: AuthSession;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      accessToken?: string;
    }
  }
}

export const AUTH_SESSION_COOKIE_NAME = 'motor_neon_session';
const NEON_UPSTREAM_COOKIE_NAME = '__Secure-neon-auth.session_token';
const encoder = new TextEncoder();
let jwksCache: { expiresAt: number; keys: Jwk[] } | null = null;

const requireAuthEnv = () => {
  if (!env.neonAuthBaseUrl || !env.neonAuthJwksUrl) {
    throw new Error('Neon Managed Auth environment is not configured. Set NEON_AUTH_BASE_URL.');
  }
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return Buffer.from(padded, 'base64');
};

const readJsonObject = async (response: globalThis.Response): Promise<Record<string, any>> => {
  const raw = await response.text();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : {};
  } catch {
    return { message: response.ok ? 'Invalid Auth response.' : 'Auth service returned an invalid response.' };
  }
};

const safeSessionToken = (token: string) => {
  if (!token || /[;\r\n]/.test(token)) throw new Error('Invalid Auth session token.');
  return token;
};

const upstreamCookie = (sessionToken: string) => (
  `${NEON_UPSTREAM_COOKIE_NAME}=${safeSessionToken(sessionToken)}`
);

const withStatus = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

// Upstream 4xx answers are the caller's problem (bad credentials, expired
// session, throttling) and keep their status; anything else is a 502 gateway
// failure instead of an opaque 500.
const authError = (payload: Record<string, any>, fallback: string, upstreamStatus = 502) => {
  const message = String(payload.message ?? payload.error_description ?? payload.error ?? fallback);
  const statusCode = upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;
  if (/invalid email or password|invalid credentials/i.test(message)) return withStatus('E-mail ou senha inválidos.', 401);
  if (/too many|rate limit/i.test(message)) return withStatus('Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.', 429);
  if (/session|token/i.test(message) && /invalid|expired|missing/i.test(message)) return withStatus('Sua sessão expirou. Entre novamente.', 401);
  return withStatus(message || fallback, statusCode);
};

const neonAuthRequest = async (
  path: string,
  init: RequestInit = {},
  sessionToken?: string,
) => {
  requireAuthEnv();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Origin', env.appBaseUrl);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (sessionToken) headers.set('Cookie', upstreamCookie(sessionToken));

  return fetch(`${env.neonAuthBaseUrl}${path}`, {
    ...init,
    headers,
    redirect: 'manual',
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
};

const mapAuthUser = (payload: Record<string, unknown>): AuthUser => ({
  id: String(payload.sub ?? payload.id ?? ''),
  email: typeof payload.email === 'string' ? payload.email : undefined,
  role: typeof payload.role === 'string' ? payload.role : 'authenticated',
  raw: payload,
});

const parseJwtPayload = (token: string) => {
  const [, encodedPayload] = token.split('.');
  if (!encodedPayload) throw new Error('Malformed JWT payload.');
  return JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as Record<string, unknown>;
};

const buildSession = (
  jwt: string,
  userPayload: Record<string, unknown>,
): AuthSession => {
  const claims = parseJwtPayload(jwt);
  const expiresAt = typeof claims.exp === 'number'
    ? claims.exp * 1000
    : Date.now() + 15 * 60 * 1000;
  const user = mapAuthUser({
    ...userPayload,
    sub: claims.sub ?? userPayload.id,
    email: claims.email ?? userPayload.email,
    role: claims.role ?? userPayload.role,
  });
  if (!jwt || !user.id) throw new Error('Neon Auth returned an invalid session.');
  return {
    access_token: jwt,
    expires_at: expiresAt,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  };
};

// Forced refreshes (unknown kid) are throttled so tokens with random kids
// cannot turn every request into a JWKS fetch.
const JWKS_FORCED_REFRESH_INTERVAL_MS = 60_000;
let lastForcedJwksRefreshAt = 0;

const getNeonJwks = async (forceRefresh = false) => {
  requireAuthEnv();
  const now = Date.now();
  const canForce = forceRefresh && now - lastForcedJwksRefreshAt >= JWKS_FORCED_REFRESH_INTERVAL_MS;
  if (!canForce && jwksCache && now < jwksCache.expiresAt) return jwksCache.keys;
  if (canForce) lastForcedJwksRefreshAt = now;
  const response = await fetch(env.neonAuthJwksUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Unable to load Neon Auth JWKS: ${response.status}`);
  const payload = await readJsonObject(response) as { keys?: Jwk[] };
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  if (!keys.length) throw new Error('Neon Auth JWKS is empty.');
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
  throw new Error(`Unsupported JWT key type: ${jwk.kty ?? 'unknown'}`);
};

const JWT_CLOCK_SKEW_MS = 60_000;

// A kid missing from the cached JWKS usually means the issuer rotated keys, so
// refetch once before rejecting. Only kid-less tokens fall back to the first key.
const findVerificationKey = async (kid: string | undefined) => {
  if (!kid) {
    const [first] = await getNeonJwks();
    if (!first) throw new Error('No JWKS available for verification');
    return first;
  }
  const cached = (await getNeonJwks()).find((item) => item.kid === kid);
  if (cached) return cached;
  const refreshed = (await getNeonJwks(true)).find((item) => item.kid === kid);
  if (!refreshed) throw new Error('Unknown JWT signing key');
  return refreshed;
};

export const verifyNeonJwt = async (token: string): Promise<AuthUser> => {
  requireAuthEnv();
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error('Malformed token');

  const header = JSON.parse(decodeBase64Url(encodedHeader).toString('utf8')) as { alg?: string; kid?: string };
  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as Record<string, unknown>;
  const expectedOrigin = new URL(env.neonAuthBaseUrl).origin;

  const now = Date.now();
  if (typeof payload.exp !== 'number') throw new Error('Token has no expiry');
  if (payload.exp * 1000 < now) throw new Error('Token expired');
  if (typeof payload.nbf === 'number' && payload.nbf * 1000 > now + JWT_CLOCK_SKEW_MS) throw new Error('Token not yet valid');
  if (payload.iss && payload.iss !== expectedOrigin) throw new Error('Invalid issuer');
  if (payload.aud) {
    const audiences = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud)];
    if (!audiences.includes(expectedOrigin)) throw new Error('Invalid audience');
  }

  const jwk = await findVerificationKey(header.kid);
  if (header.alg === 'EdDSA' && !(jwk.kty === 'OKP' && jwk.crv === 'Ed25519')) {
    throw new Error('JWT algorithm/key mismatch');
  }

  const key = await importVerificationKey(jwk);
  const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
  const signature = decodeBase64Url(encodedSignature);
  const verified = jwk.kty === 'OKP'
    ? await crypto.subtle.verify('Ed25519', key, signature, data)
    : jwk.kty === 'EC'
      ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, data)
      : await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);

  if (!verified) throw new Error('Invalid token signature');
  const user = mapAuthUser(payload);
  if (!user.id) throw new Error('JWT subject is missing');
  return user;
};

export const readAuthSessionCookie = (req: Pick<Request, 'headers'>) => {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== AUTH_SESSION_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
};

export const setAuthSessionCookie = (
  res: ExpressResponse,
  sessionToken: string,
  expiresAt?: number,
) => {
  const maxAgeSeconds = expiresAt
    ? Math.max(60, Math.floor((expiresAt - Date.now()) / 1000))
    : 60 * 60 * 24 * 30;
  res.append('Set-Cookie', [
    `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(safeSessionToken(sessionToken))}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; '));
};

export const clearAuthSessionCookie = (res: ExpressResponse) => {
  res.append('Set-Cookie', [
    `${AUTH_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; '));
};

export const refreshAuthSession = async (sessionToken: string): Promise<AuthFlowResult> => {
  const safeToken = safeSessionToken(sessionToken);
  const [sessionResponse, jwtResponse] = await Promise.all([
    neonAuthRequest('/get-session', { method: 'GET' }, safeToken),
    neonAuthRequest('/token', { method: 'GET' }, safeToken),
  ]);

  const sessionPayload = await readJsonObject(sessionResponse);
  const jwtPayload = await readJsonObject(jwtResponse);
  if (!sessionResponse.ok) throw authError(sessionPayload, 'Não foi possível restaurar sua sessão.', sessionResponse.status);
  if (!jwtResponse.ok) throw authError(jwtPayload, 'Não foi possível emitir o token da sessão.', jwtResponse.status);

  const jwt = String(jwtPayload.token ?? '');
  const user = sessionPayload.user && typeof sessionPayload.user === 'object'
    ? sessionPayload.user as Record<string, unknown>
    : {};
  return {
    sessionToken: safeToken,
    session: buildSession(jwt, user),
  };
};

const establishSession = async (
  response: globalThis.Response,
  fallback: string,
): Promise<AuthFlowResult> => {
  const payload = await readJsonObject(response);
  if (!response.ok) throw authError(payload, fallback, response.status);
  const sessionToken = String(payload.token ?? '');
  if (!sessionToken) throw new Error('Neon Auth did not return a session token.');
  return refreshAuthSession(sessionToken);
};

export const signInWithPassword = async (email: string, password: string): Promise<AuthFlowResult> => (
  establishSession(await neonAuthRequest('/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      rememberMe: true,
    }),
  }), 'Falha ao autenticar.')
);

export const signUpWithPassword = async (
  name: string,
  email: string,
  password: string,
): Promise<AuthFlowResult> => (
  establishSession(await neonAuthRequest('/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      rememberMe: true,
    }),
  }), 'Não foi possível criar o primeiro acesso.')
);

export const requestPasswordReset = async (email: string, redirectTo: string) => {
  const response = await neonAuthRequest('/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      redirectTo,
    }),
  });
  const payload = await readJsonObject(response);
  if (!response.ok) throw authError(payload, 'Não foi possível iniciar a recuperação de senha.', response.status);
};

export const resetPassword = async (token: string, newPassword: string) => {
  const response = await neonAuthRequest('/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
  const payload = await readJsonObject(response);
  if (!response.ok) throw authError(payload, 'Não foi possível redefinir a senha.', response.status);
  return payload;
};

export const changePassword = async (
  sessionToken: string,
  currentPassword: string,
  newPassword: string,
) => {
  const response = await neonAuthRequest('/change-password', {
    method: 'POST',
    body: JSON.stringify({
      currentPassword,
      newPassword,
      revokeOtherSessions: false,
    }),
  }, sessionToken);
  const payload = await readJsonObject(response);
  if (!response.ok) throw authError(payload, 'Não foi possível alterar a senha.', response.status);
  return payload;
};

export const signOutAuth = async (sessionToken: string) => {
  const response = await neonAuthRequest('/sign-out', {
    method: 'POST',
    body: '{}',
  }, sessionToken);
  if (!response.ok && response.status !== 401) {
    const payload = await readJsonObject(response);
    throw authError(payload, 'Não foi possível encerrar a sessão remota.', response.status);
  }
};

export const authMiddleware = async (req: Request, res: ExpressResponse, next: NextFunction) => {
  try {
    requireAuthEnv();
  } catch (error) {
    res.status(500).json({
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Auth unavailable',
    });
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ status: 'partial', generatedAt: new Date().toISOString(), error: 'Missing bearer token.' });
    return;
  }

  try {
    const accessToken = header.slice('Bearer '.length);
    req.accessToken = accessToken;
    req.authUser = await verifyNeonJwt(accessToken);
    next();
  } catch (error) {
    res.status(401).json({
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unauthorized',
    });
  }
};
