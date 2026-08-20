import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const CANONICAL_MAIS_RETORNO_BASE = 'https://data.maisretorno.com/mr-data/v4/api';
const CANONICAL_APP_BASE = 'https://motor-originac-srm.vercel.app';

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
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

const probeOpenAi = async () => {
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const model = process.env.OPENAI_TASK_MODEL ?? 'gpt-5-mini';
  if (!apiKey) return { configured: false, ok: false, model, reason: 'missing_secret' };
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: 'Reply only with OK.', max_output_tokens: 16 }),
      signal: AbortSignal.timeout(12_000),
    });
    return { configured: true, ok: response.ok, model, httpStatus: response.status };
  } catch (error) {
    return { configured: true, ok: false, model, reason: safeError(error) };
  }
};

const probeAnthropic = async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  const model = process.env.ANTHROPIC_TASK_MODEL ?? 'claude-sonnet-4-20250514';
  if (!apiKey) return { configured: false, ok: false, model, reason: 'missing_secret' };
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Reply only with OK.' }] }),
      signal: AbortSignal.timeout(12_000),
    });
    return { configured: true, ok: response.ok, model, httpStatus: response.status };
  } catch (error) {
    return { configured: true, ok: false, model, reason: safeError(error) };
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
  const [openai, anthropic, maisRetorno, microsoft] = await Promise.all([
    probeOpenAi(),
    probeAnthropic(),
    probeMaisRetorno(),
    probeMicrosoft(),
  ]);
  const aiConfigured = openai.configured || anthropic.configured;
  const aiOk = (openai.configured && openai.ok) || (anthropic.configured && anthropic.ok);
  const allRequiredOk = microsoft.ok && maisRetorno.ok && aiConfigured && aiOk;
  return {
    status: allRequiredOk ? 'real' : 'partial',
    generatedAt: new Date().toISOString(),
    data: {
      microsoft,
      taskAi: { openai, anthropic, atLeastOneConfigured: aiConfigured, atLeastOneHealthy: aiOk },
      maisRetorno,
      aiGateway: {
        staticKeyConfigured: Boolean(process.env.AI_GATEWAY_API_KEY),
        oidcAvailable: Boolean(process.env.VERCEL_OIDC_TOKEN),
        model: process.env.KNOWLEDGE_LEARNING_MODEL ?? 'openai/gpt-5.4',
      },
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
