import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './vercelTypes.js';
import { verifyActiveIdentity, verifyGodModeIdentity } from '../serverless/neon-auth.js';
import { requireNeonDataClient } from '../serverless/neon-data.js';
import { isCronSecretAuthorized } from '../serverless/cron-auth.js';

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
const ZERO_COST_POLICY = 'locked';
const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unexpected error.';
const errorStatusCode = (error: unknown) => typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;
const retryAfterSeconds = (error: unknown) => typeof (error as any)?.retryAfterSeconds === 'number' ? (error as any).retryAfterSeconds : undefined;

const logRequestError = (error: unknown) => {
  const statusCode = errorStatusCode(error);
  if (statusCode >= 500) {
    console.error('[agentetome]', error);
    return;
  }
  console.warn('[agentetome] request rejected', { statusCode, message: errorMessage(error) });
};

const writeJson = (res: VercelResponse, statusCode: number, payload: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Origination-Runtime', RUNTIME);
  res.setHeader('X-AI-Cost-Policy', 'free-only');
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

const authenticate = async (req: AgentetomeRequest): Promise<AuthenticatedUser> => {
  const authorization = requestValue(req.headers.authorization);
  if (!authorization?.startsWith('Bearer ')) throw new ApiError('Missing bearer token.', 401);
  const { user } = await verifyActiveIdentity(authorization.slice('Bearer '.length));
  return { id: user.id, email: user.email, authorization };
}

const authenticateCron = (req: AgentetomeRequest) => {
  if (!isCronSecretAuthorized(req.headers.authorization)) throw new ApiError('Unauthorized learning worker.', 401);
};

const serviceRpc = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  try {
    return await requireNeonDataClient().rpc<T>(name, body);
  } catch (error) {
    throw new ApiError(`RPC ${name} failed on Neon: ${errorMessage(error)}`, 502);
  }
};

const requireGodMode = async (authorization: string) => {
  await verifyGodModeIdentity(authorization.slice('Bearer '.length));
}

const parseRetryAfter = (value: string | null) => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
};

const validateXml = async (user: AuthenticatedUser, body: Record<string, unknown>) => {
  const compact = String(body.xmlBase64 ?? body.xml_base64 ?? '').replace(/\s+/g, '');
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) throw new ApiError('xmlBase64 inválido.', 400);
  let bytes: Buffer;
  try { bytes = Buffer.from(compact, 'base64'); } catch { throw new ApiError('xmlBase64 inválido.', 400); }
  if (!bytes.length) throw new ApiError('O XML está vazio.', 400);
  if (bytes.length > 5 * 1024 * 1024) throw new ApiError('O XML excede o limite de 5 MB do Agentetome.', 413);
  if (!bytes.subarray(0, Math.min(bytes.length, 256)).toString('utf8').trimStart().startsWith('<')) {
    throw new ApiError('O conteúdo decodificado não parece ser XML.', 422);
  }

  const apiKey = process.env.AGENTETOME_API_KEY ?? '';
  if (!apiKey) throw new ApiError('AGENTETOME_API_KEY não está configurada.', 503);
  const fingerprint = createHash('sha256').update(bytes).digest('hex');
  const startedAt = Date.now();

  const form = new FormData();
  form.append('arquivo', new Blob([new Uint8Array(bytes)], { type: 'application/xml' }), 'informe.xml');
  const provider = await fetch('https://www.agentetome.com/api/v1/validar-xml', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    body: form,
  });
  const retryAfter = parseRetryAfter(provider.headers.get('retry-after'));
  const raw = await provider.text();
  let report: Record<string, unknown> = {};
  try { report = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { report = { error: raw.slice(0, 500) }; }

  const auditStatus = provider.status === 429 || provider.status === 503
    ? 'blocked'
    : provider.status === 422 ? 'partial' : provider.ok ? 'completed' : 'failed';
  await serviceRpc('record_agentetome_validation_audit', {
    p_requested_by: user.id,
    p_status: auditStatus,
    p_http_status: provider.status,
    p_duration_ms: Date.now() - startedAt,
    p_request_fingerprint: fingerprint,
    p_response_summary: {
      ok: report.ok ?? null,
      leiaute: report.leiaute ?? null,
      contadores: report.contadores ?? {},
      xmlBytes: bytes.length,
      rawXmlPersisted: false,
      providerDiscardsXml: true,
    },
    p_retry_after_seconds: retryAfter ?? null,
  }).catch(() => undefined);

  return {
    statusCode: provider.status,
    payload: {
      status: provider.ok ? 'real' : provider.status === 422 ? 'partial' : 'failed',
      generatedAt: new Date().toISOString(),
      data: report,
      metadata: {
        requestFingerprint: fingerprint,
        xmlBytes: bytes.length,
        rawXmlPersisted: false,
        providerDiscardsXml: true,
        sentToCvm: false,
      },
      retryAfterSeconds: retryAfter,
    },
    retryAfter: retryAfter === undefined ? null : String(retryAfter),
  };
};

export default async function handler(req: AgentetomeRequest, res: VercelResponse) {
  const operation = requestValue(req.query.operation) ?? 'status';
  res.setHeader('X-Origination-Runtime', operation === 'knowledge-learning' ? 'knowledge-learning-zero-cost-lock-v1' : RUNTIME);
  res.setHeader('X-AI-Cost-Policy', 'free-only');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return res.status(204).json(null);
  }

  try {
    if (operation === 'knowledge-learning' && ['GET', 'POST'].includes(req.method ?? '')) {
      authenticateCron(req);
      return writeJson(res, 423, {
        status: 'paused',
        generatedAt: new Date().toISOString(),
        policy: ZERO_COST_POLICY,
        error: 'Knowledge Learning pago está bloqueado pela política zero-cost. Nenhum AI Gateway/OpenAI/Anthropic será chamado.',
        paidProviderAttempted: false,
        nextAction: 'Use exclusivamente o Motor Free Inference Node após smoke e orçamento zero comprovados.',
      });
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
      await requireGodMode(user.authorization);
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
      await requireGodMode(user.authorization);
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
        note: failed ? 'O refresh não foi enfileirado.' : 'Refresh real enfileirado no Neon. O pacote será validado, persistido e promovido ao Market Map.',
      });
    }

    if (operation === 'validate-xml' && req.method === 'POST') {
      const proxied = await validateXml(user, readBody(req));
      if (proxied.retryAfter) res.setHeader('Retry-After', proxied.retryAfter);
      return writeJson(res, proxied.statusCode, proxied.payload);
    }

    return writeJson(res, 404, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: `Operação Agentetome não encontrada: ${operation}.`,
    });
  } catch (error) {
    logRequestError(error);
    return writeJson(res, errorStatusCode(error), {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: errorMessage(error),
      retryAfterSeconds: retryAfterSeconds(error),
    });
  }
}
