import type { NextFunction, Request, Response } from 'express';
import { env } from './env.js';

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
export type AuthUser = { id: string; email?: string; role?: string; raw: Record<string, unknown> };
export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  user: { id: string; email?: string; role?: string };
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      accessToken?: string;
    }
  }
}

const encoder = new TextEncoder();
let jwksCache: { expiresAt: number; keys: Jwk[] } | null = null;

const requireAuthEnv = () => {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error('Supabase auth environment is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return Buffer.from(padded, 'base64');
};

const mapAuthUser = (payload: Record<string, unknown>): AuthUser => ({
  id: String(payload.sub ?? payload.id ?? ''),
  email: typeof payload.email === 'string' ? payload.email : undefined,
  role: typeof payload.role === 'string'
    ? payload.role
    : (typeof payload.app_metadata === 'object' && payload.app_metadata && 'role' in payload.app_metadata
      ? String((payload.app_metadata as Record<string, unknown>).role)
      : 'authenticated'),
  raw: payload,
});

const mapSession = (payload: Record<string, any>): AuthSession => ({
  access_token: String(payload.access_token ?? ''),
  refresh_token: typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined,
  expires_at: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
  user: {
    id: String(payload.user?.id ?? payload.user?.sub ?? ''),
    email: payload.user?.email,
    role: payload.user?.role ?? payload.user?.app_metadata?.role ?? 'authenticated',
  },
});

const getSupabaseJwks = async () => {
  requireAuthEnv();
  if (jwksCache && Date.now() < jwksCache.expiresAt) return jwksCache.keys;
  const response = await fetch(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`);
  if (!response.ok) throw new Error(`Unable to load Supabase JWKS: ${response.status}`);
  const payload = await response.json() as { keys: Jwk[] };
  jwksCache = { expiresAt: Date.now() + 60 * 60 * 1000, keys: payload.keys ?? [] };
  return jwksCache.keys;
};

const importVerificationKey = async (jwk: Jwk) => {
  if (jwk.kty === 'RSA') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  if (jwk.kty === 'EC') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  throw new Error(`Unsupported JWT key type: ${jwk.kty}`);
};

export const verifySupabaseJwt = async (token: string): Promise<AuthUser> => {
  requireAuthEnv();
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error('Malformed token');

  const header = JSON.parse(decodeBase64Url(encodedHeader).toString('utf8')) as { alg?: string; kid?: string };
  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as Record<string, unknown>;

  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) throw new Error('Token expired');
  const expectedIssuer = `${env.supabaseUrl}/auth/v1`;
  if (payload.iss && payload.iss !== expectedIssuer) throw new Error('Invalid issuer');

  const jwks = await getSupabaseJwks();
  const jwk = jwks.find((item) => item.kid === header.kid) ?? jwks[0];
  if (!jwk) throw new Error('No JWKS available for verification');
  const key = await importVerificationKey(jwk);
  const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
  const signature = decodeBase64Url(encodedSignature);

  const verified = jwk.kty === 'EC'
    ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, data)
    : await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);

  if (!verified) throw new Error('Invalid token signature');
  return mapAuthUser(payload);
};

export const signInWithPassword = async (email: string, password: string): Promise<AuthSession> => {
  requireAuthEnv();
  const response = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: env.supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json() as Record<string, any>;
  if (!response.ok) {
    throw new Error(String(payload.error_description ?? payload.msg ?? payload.error ?? 'Falha no login com Supabase Auth.'));
  }
  return mapSession(payload);
};

export const fetchCurrentSupabaseUser = async (accessToken: string): Promise<AuthUser> => {
  requireAuthEnv();
  const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error_description ?? payload.msg ?? payload.error ?? 'Unable to fetch current user.'));
  return mapAuthUser(payload);
};

export const signOutSupabase = async (accessToken: string) => {
  requireAuthEnv();
  const response = await fetch(`${env.supabaseUrl}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase logout failed: ${response.status} ${body}`);
  }
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuthEnv();
  } catch (error) {
    res.status(500).json({ status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Auth unavailable' });
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
    req.authUser = await verifySupabaseJwt(accessToken);
    next();
  } catch (error) {
    res.status(401).json({ status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Unauthorized' });
  }
};
