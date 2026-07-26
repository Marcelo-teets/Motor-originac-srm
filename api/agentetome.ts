import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './vercelTypes.js';

type AgentetomeRequest = VercelRequest & { body?: unknown };
type AuthenticatedUser = { id: string; email?: string; authorization: string };

class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const RUNTIME = 'agentetome-v2';
const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unexpected error.';
const errorStatusCode = (error: unknown) => typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;
const retryAfterSeconds = (error: unknown) => typeof (error as any)?.retryAfterSeconds === 'number' ? (error as any).retryAfterSeconds : undefined;
const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const writeJson = (res: VercelResponse, statusCode: number, payload: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Origination-Runtime', RUNTIME);
  return res.status(statusCode).json(payload);
};

const readBody = (req: AgentetomeRequest) => {
  const body = req.body;
  if (!body) return {} as Record<string, unknown>;
  if (typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > 7_250_000) throw new ApiError('Corpo da requisição acima do limite permitido.', 413);
    try { return JSON.parse(body) as Record<string, unknown>; } catch { throw new ApiError('JSON inválido.', 400); }
  }
  throw new ApiError('Corpo da requisição inválido.', 400);
};

const runtimeConfig = () => {
  const supabaseUrl = normalizeBaseUrl(process.env.SUPABASE_URL ?? '');
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new ApiError('Supabase runtime não está configurado.', 503);
  return { supabaseUrl, anonKey, serviceRoleKey };
};

const authenticate = async (req: AgentetomeRequest): Promise<AuthenticatedUser> => {
  const authorization = requestValue(req.headers.authorization);
  if (!authorization?.startsWith('Bearer ')) throw new ApiError('Missing bearer token.', 401);
  const { supabaseUrl, anonKey } = runtimeConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || !payload.id) throw new ApiError(String(payload.error_description ?? payload.msg ?? payload.error ?? 'Unauthorized.'), 401);
  return { id: String(payload.id), email: typeof payload.email === 'string' ? payload.email : undefined, authorization };
};

const authenticateCron = (req: AgentetomeRequest) => {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  const received = requestValue(req.headers.authorization) ?? '';
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (!process.env.CRON_SECRET || expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new ApiError('Unauthorized learning worker.', 401);
  }
};

const serviceRpc = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  const { supabaseUrl, serviceRoleKey } = runtimeConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (!response.ok) throw new ApiError(`RPC ${name} failed (${response.status}): ${JSON.stringify(payload)}`, 502);
  return payload as T;
};

const requireGodMode = async (userId: string) => {
  const { supabaseUrl, serviceRoleKey } = runtimeConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/user_profiles`);
  url.searchParams.set('select', 'id,role,status');
  url.searchParams.set('id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const response = await fetch(url, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  const rows = await response.json().catch(() => []) as Array<{ role?: string; status?: string }>;
  if (!response.ok || rows[0]?.role !== 'god_mode' || rows[0]?.status !== 'active') {
    throw new ApiError('GOD-MODE ativo é obrigatório para esta operação.', 403);
  }
};

const proxyXmlValidation = async (user: AuthenticatedUser, body: Record<string, unknown>) => {
  const { supabaseUrl, anonKey } = runtimeConfig();
  const response = await fetch(`${supabaseUrl}/functions/v1/agentetome-validate-xml`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: user.authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ xmlBase64: body.xmlBase64 ?? body.xml_base64 ?? '' }),
  });
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = { error: raw.slice(0, 500) }; }
  return { statusCode: response.status, payload, retryAfter: response.headers.get('retry-after') };
};

export default async function handler(req: AgentetomeRequest, res: VercelResponse) {
  const operation = requestValue(req.query.operation) ?? 'status';
  res.setHeader('X-Origination-Runtime', operation === 'knowledge-learning' ? 'knowledge-learning-agent-v14' : RUNTIME);
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return res.status(204).json(null);
  }

  try {
    if (operation === 'knowledge-learning' && ['GET', 'POST'].includes(req.method ?? '')) {
      authenticateCron(req);
      const body = readBody(req);
      const learning = await import('../backend/src/ai/knowledgeLearningAgent.js');
      const result = await learning.runKnowledgeLearningAgent(serviceRpc, {
        batchSize: Number(body.batchSize ?? body.batch_size ?? 2),
        dailyLimit: Number(body.dailyLimit ?? body.daily_limit ?? 48),
        leaseSeconds: Number(body.leaseSeconds ?? body.lease_seconds ?? 900),
        workerId: typeof body.workerId === 'string' ? body.workerId : undefined,
        deployment: {
          commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
          environment: process.env.VERCEL_ENV ?? null,
          url: process.env.VERCEL_URL ?? null,
        },
      });
      const statusCode = result.status === 'failed' ? 502 : result.status === 'partial' ? 207 : 200;
      return writeJson(res, statusCode, { generatedAt: new Date().toISOString(), ...result });
    }

    const user = await authenticate(req);

    if (operation === 'status' && req.method === 'GET') {
      const runtimeStatus = await serviceRpc<Record<string, unknown>>('agentetome_runtime_status', {});
      return writeJson(res, 200, {
        status: runtimeStatus.status ?? 'partial',
        generatedAt: new Date().toISOString(),
        data: runtimeStatus,
      });
    }

    if (operation === 'admin-manifest' && req.method === 'GET') {
      await requireGodMode(user.id);
      const administrator = String(requestValue(req.query.admin) ?? 'oliveira trust').trim();
      const cut = String(requestValue(req.query.corte) ?? 'recente');
      const competence = requestValue(req.query.competencia) ?? null;
      const result = await serviceRpc<Record<string, any>>('agentetome_admin_manifest_secure', {
        p_admin: administrator,
        p_cut: cut,
        p_competence: competence,
        p_requested_by: user.id,
      });
      const providerError = result.provider_error === true || Number(result.http_status ?? 0) >= 400;
      return writeJson(res, providerError ? 502 : 200, {
        status: providerError ? 'partial' : 'real',
        generatedAt: new Date().toISOString(),
        data: result,
      });
    }

    if ((operation === 'admin-export' || operation === 'refresh') && req.method === 'POST') {
      await requireGodMode(user.id);
      const body = readBody(req);
      const administrator = String(body.admin ?? body.administrator ?? 'oliveira trust').trim();
      const cut = String(body.corte ?? body.cut ?? 'recente');
      const competence = typeof (body.competencia ?? body.competence) === 'string' ? String(body.competencia ?? body.competence) : null;
      const format = String(body.formato ?? body.format ?? 'csv');
      const result = await serviceRpc<Record<string, any>>('queue_agentetome_admin_export', {
        p_admin: administrator,
        p_cut: cut,
        p_competence: competence,
        p_format: format,
        p_requested_by: user.id,
        p_trigger_type: 'manual',
      });
      const failed = result.status === 'failed' || result.provider_error === true;
      return writeJson(res, failed ? 502 : 202, {
        status: failed ? 'partial' : 'real',
        generatedAt: new Date().toISOString(),
        data: result,
        note: failed ? 'O refresh não foi enfileirado.' : 'Refresh real enfileirado no Supabase. O pacote será validado, persistido e promovido ao Market Map.',
      });
    }

    if (operation === 'validate-xml' && req.method === 'POST') {
      const proxied = await proxyXmlValidation(user, readBody(req));
      if (proxied.retryAfter) res.setHeader('Retry-After', proxied.retryAfter);
      return writeJson(res, proxied.statusCode, proxied.payload);
    }

    return writeJson(res, 404, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: `Operação Agentetome não encontrada: ${operation}.`,
    });
  } catch (error) {
    console.error('[agentetome]', error);
    return writeJson(res, errorStatusCode(error), {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: errorMessage(error),
      retryAfterSeconds: retryAfterSeconds(error),
    });
  }
}
