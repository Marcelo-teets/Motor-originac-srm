import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import { env } from './env.js';
import { decodeBase64Url, verifyNeonAccessToken } from './neonJwt.js';

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

const requireAuthEnv = () => {
  if (!env.neonAuthBaseUrl || !env.neonAuthJwksUrl) {
    throw new Error('Neon Managed Auth environment is not configured. Set NEON_AUTH_BASE_URL.');
  }
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

const authError = (payload: Record<string, any>, fallback: string) => {
  const message = String(payload.message ?? payload.error_description ?? payload.error ?? fallback);
  if (/invalid email or password|invalid credentials/i.test(message)) return new Error('E-mail ou senha inválidos.');
  if (/too many|rate limit/i.test(message)) return new Error('Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.');
  if (/session|token/i.test(message) && /invalid|expired|missing/i.test(message)) return new Error('Sua sessão expirou. Entre novamente.');
  return new Error(message || fallback);
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

export const verifyNeonJwt = async (token: string): Promise<AuthUser> => {
  requireAuthEnv();
  const claims = await verifyNeonAccessToken(token, {
    authBaseUrl: env.neonAuthBaseUrl,
    jwksUrl: env.neonAuthJwksUrl,
  });
  return { id: claims.id, email: claims.email, role: claims.role, raw: claims.payload };
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
  if (!sessionResponse.ok) throw authError(sessionPayload, 'Não foi possível restaurar sua sessão.');
  if (!jwtResponse.ok) throw authError(jwtPayload, 'Não foi possível emitir o token da sessão.');

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
  if (!response.ok) throw authError(payload, fallback);
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
  if (!response.ok) throw authError(payload, 'Não foi possível iniciar a recuperação de senha.');
};

export const resetPassword = async (token: string, newPassword: string) => {
  const response = await neonAuthRequest('/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
  const payload = await readJsonObject(response);
  if (!response.ok) throw authError(payload, 'Não foi possível redefinir a senha.');
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
  if (!response.ok) throw authError(payload, 'Não foi possível alterar a senha.');
  return payload;
};

export const signOutAuth = async (sessionToken: string) => {
  const response = await neonAuthRequest('/sign-out', {
    method: 'POST',
    body: '{}',
  }, sessionToken);
  if (!response.ok && response.status !== 401) {
    const payload = await readJsonObject(response);
    throw authError(payload, 'Não foi possível encerrar a sessão remota.');
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
