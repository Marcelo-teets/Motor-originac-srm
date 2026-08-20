import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const CANONICAL_MAIS_RETORNO_BASE = 'https://data.maisretorno.com/mr-data/v4/api';
const CANONICAL_APP_BASE = 'https://motor-originac-srm.vercel.app';
const FREE_INFERENCE_BASE_URL = (process.env.FREE_INFERENCE_BASE_URL ?? 'https://hungry-mountainous-harddrives--antunespmarcelo.replit.app').replace(/\/+$/, '');
const ZERO_COST_POLICY = 'locked';

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
    'X-AI-Cost-Policy': 'free-only',
  });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
const safeError = (error: unknown) => error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);

const isCronAuthorized = (req: IncomingMessage) => {
  const secret = process.env.CRON_SECRET ?? '';
  const received = getHeader(req, 'authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return Boolean(secret && left.length === right.length && timingSafeEqual(left, right));
};

const paidProviderStatus = (name: 'openai' | 'anthropic' | 'vercel-ai-gateway') => ({
  provider: name,
  configured: false,
  ok: false,
  blockedByPolicy: true,
  policy: ZERO_COST_POLICY,
  reason: 'paid_provider_disabled_until_explicit_user_revocation',
});

const probeFreeInference = async () => {
  try {
    const response = await fetch(`${FREE_INFERENCE_BASE_URL}/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    return {
      configured: true,
      ok: response.ok,
      baseUrl: FREE_INFERENCE_BASE_URL,
      httpStatus: response.status,
      model: payload?.model ?? process.env.FREE_INFERENCE_MODEL ?? 'motor-local',
      paid: false,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      baseUrl: FREE_INFERENCE_BASE_URL,
      model: process.env.FREE_INFERENCE_MODEL ?? 'motor-local',
      paid: false,
      reason: safeError(error),
    };
  }
};

const probeMaisRetorno = async () => {
  const apiKey = process.env.MAIS_RETORNO_API_KEY ?? '';
  const configuredBase = normalizeBaseUrl(process.env.MAIS_RETORNO_API_BASE_URL ?? '');
  const baseUrl = configuredBase.includes('/mr-data/v4/api') ? configuredBase : CANONICAL_MAIS_RETORNO_BASE;
  if (!apiKey) return { configured: false, ok: false, baseUrl, reason: 'missing_secret', creditCost: 0 };
  try {
    const response = await fetch(`${baseUrl}/search/${encodeURIComponent('fidc')}`, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json().catch(() => null) as unknown;
    return {
      configured: true,
      ok: response.ok && Array.isArray(payload),
      baseUrl,
      httpStatus: response.status,
      creditCost: 0,
      resultCount: Array.isArray(payload) ? payload.length : null,
    };
  } catch (error) {
    return { configured: true, ok: false, baseUrl, creditCost: 0, reason: safeError(error) };
  }
};

const probeMicrosoft = async () => {
  const required = {
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID ?? '',
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET ?? '',
    MICROSOFT_REDIRECT_URI: process.env.MICROSOFT_REDIRECT_URI ?? '',
    MICROSOFT_TOKEN_ENCRYPTION_KEY: process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY ?? '',
    MICROSOFT_STATE_SECRET: process.env.MICROSOFT_STATE_SECRET ?? '',
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name);
  const redirectUri = required.MICROSOFT_REDIRECT_URI;
  const canonicalRedirect = `${CANONICAL_APP_BASE}/api/integrations/microsoft/callback`;
  let discoveryOk = false;
  try {
    const tenant = encodeURIComponent(process.env.MICROSOFT_TENANT_ID ?? 'common');
    const response = await fetch(`https://login.microsoftonline.com/${tenant}/v2.0/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(8_000),
    });
    discoveryOk = response.ok;
  } catch {
    discoveryOk = false;
  }
  return {
    configured: missing.length === 0,
    ok: missing.length === 0 && redirectUri === canonicalRedirect && discoveryOk,
    missing,
    redirectCanonical: redirectUri === canonicalRedirect,
    discoveryOk,
    plannerGroupConfigured: Boolean(process.env.MICROSOFT_PLANNER_GROUP_ID),
  };
};

const providerProbe = async () => {
  const [freeInference, maisRetorno, microsoft] = await Promise.all([
    probeFreeInference(),
    probeMaisRetorno(),
    probeMicrosoft(),
  ]);
  const allRequiredOk = microsoft.ok && maisRetorno.ok && freeInference.ok;
  return {
    status: allRequiredOk ? 'real' : 'partial',
    generatedAt: new Date().toISOString(),
    data: {
      costPolicy: {
        mode: 'free-only',
        locked: true,
        revocationRequired: true,
      },
      microsoft,
      taskAi: {
        provider: 'motor-free-inference-node',
        freeInference,
        paidFallbackEnabled: false,
      },
      paidProviders: {
        openai: paidProviderStatus('openai'),
        anthropic: paidProviderStatus('anthropic'),
        aiGateway: paidProviderStatus('vercel-ai-gateway'),
      },
      maisRetorno,
    },
  };
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
    return;
  }

  const requestUrl = new URL(req.url ?? '/', 'https://motor-originac-srm.vercel.app');
  const operation = requestUrl.searchParams.get('operation') ?? 'snapshot';

  if (operation === 'provider-probe') {
    if (!isCronAuthorized(req)) {
      writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized provider probe.' });
      return;
    }
    const result = await providerProbe();
    writeJson(res, result.status === 'real' ? 200 : 207, result);
    return;
  }

  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Missing bearer token.' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ? normalizeBaseUrl(process.env.SUPABASE_URL) : '';
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey) {
    writeJson(res, 503, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Supabase authentication is not configured for public-data operations.' });
    return;
  }

  const accessToken = authorization.slice('Bearer '.length);
  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    });

    if (!authResponse.ok) {
      writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized.' });
      return;
    }

    const { PublicDataOperationsService } = await import('../backend/src/services/publicDataOperationsService.js');
    const result = await new PublicDataOperationsService().getSnapshot();
    writeJson(res, result.status === 'real' ? 200 : 207, {
      status: result.status,
      generatedAt: new Date().toISOString(),
      data: result.snapshot,
      ...(result.note ? { note: result.note } : {}),
    });
  } catch (error) {
    writeJson(res, 500, { status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
  }
}
