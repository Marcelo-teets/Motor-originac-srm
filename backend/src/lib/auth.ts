import type { NextFunction, Request, Response } from 'express';
import { env } from './env.js';

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
export type AuthUser = { id: string; email?: string; role?: string; raw: Record<string, unknown> };

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

const encoder = new TextEncoder();
let jwksCache: { expiresAt: number; keys: Jwk[] } | null = null;

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return Buffer.from(padded, 'base64');
};

const getSupabaseJwks = async () => {
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

  return {
    id: String(payload.sub ?? ''),
    email: typeof payload.email === 'string' ? payload.email : undefined,
    role: typeof payload.role === 'string' ? payload.role : (typeof payload.app_metadata === 'object' && payload.app_metadata && 'role' in payload.app_metadata ? String((payload.app_metadata as Record<string, unknown>).role) : 'authenticated'),
    raw: payload,
  };
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    res.status(500).json({ status: 'partial', generatedAt: new Date().toISOString(), error: 'Supabase auth environment is not configured.' });
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ status: 'partial', generatedAt: new Date().toISOString(), error: 'Missing bearer token.' });
    return;
  }

  try {
    req.authUser = await verifySupabaseJwt(header.slice('Bearer '.length));
    next();
  } catch (error) {
    res.status(401).json({ status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Unauthorized' });
  }
};
