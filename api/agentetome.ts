import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './vercelTypes.js';

type AgentetomeRequest = VercelRequest & { body?: unknown };
type AgentetomeModule = typeof import('../backend/src/lib/agenteTome.js');
type AuditInput = Parameters<AgentetomeModule['recordAgenteTomeOperation']>[0];
type ProviderResult = {
  data: Record<string, any>;
  httpStatus: number;
  durationMs: number;
  retryAfterSeconds?: number;
  providerError: boolean;
  requestFingerprint?: string;
  xmlBytes?: number;
};

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

const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unexpected error.';
const errorStatusCode = (error: unknown) => typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;
const retryAfterSeconds = (error: unknown) => typeof (error as any)?.retryAfterSeconds === 'number' ? (error as any).retryAfterSeconds : undefined;

const writeJson = (res: VercelResponse, statusCode: number, payload: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(statusCode).json(payload);
};

const readBody = (req: AgentetomeRequest) => {
  const body = req.body;
  if (!body) return {} as Record<string, unknown>;
  if (typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > 7_250_000) throw new ApiError('Corpo da requisição acima do limite permitido.', 413);
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new ApiError('JSON inválido.', 400);
    }
  }
  throw new ApiError('Corpo da requisição inválido.', 400);
};

const authenticate = async (req: AgentetomeRequest) => {
  const authorization = requestValue(req.headers.authorization);
  if (!authorization?.startsWith('Bearer ')) throw new ApiError('Missing bearer token.', 401);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new ApiError('Supabase Auth não está configurado no runtime.', 503);

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: authorization,
    },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || !payload.id) {
    throw new ApiError(String(payload.error_description ?? payload.msg ?? payload.error ?? 'Unauthorized.'), 401);
  }
  return { id: String(payload.id), email: typeof payload.email === 'string' ? payload.email : undefined };
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
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!supabaseUrl || !serviceRoleKey) throw new ApiError('Supabase service runtime is not configured.', 503);
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

const auditStatusForError = (error: unknown): AuditInput['status'] => [429, 503].includes(errorStatusCode(error)) ? 'blocked' : 'failed';

async function auditedCall(
  module: AgentetomeModule,
  input: Omit<AuditInput, 'status' | 'responseSummary' | 'httpStatus' | 'retryAfterSeconds' | 'durationMs'>,
  runner: () => Promise<ProviderResult>,
) {
  const startedAt = Date.now();
  try {
    const result = await runner();
    await module.recordAgenteTomeOperation({
      ...input,
      requestFingerprint: input.requestFingerprint ?? result.requestFingerprint,
      status: result.providerError ? 'partial' : 'completed',
      responseSummary: {
        ...module.summarizeAgenteTomePayload(input.operation, result.data),
        ...(typeof result.xmlBytes === 'number' ? { xmlBytes: result.xmlBytes } : {}),
      },
      httpStatus: result.httpStatus,
      retryAfterSeconds: result.retryAfterSeconds,
      durationMs: result.durationMs,
    });
    return result;
  } catch (error) {
    await module.recordAgenteTomeOperation({
      ...input,
      status: auditStatusForError(error),
      responseSummary: { error: errorMessage(error) },
      httpStatus: errorStatusCode(error),
      retryAfterSeconds: retryAfterSeconds(error),
      durationMs: Date.now() - startedAt,
    }).catch(() => undefined);
    throw error;
  }
}

export default async function handler(req: AgentetomeRequest, res: VercelResponse) {
  const operation = requestValue(req.query.operation) ?? 'status';
  res.setHeader('X-Origination-Runtime', operation === 'knowledge-learning' ? 'knowledge-learning-agent-v14' : 'agentetome-v1');
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
    const module = await import('../backend/src/lib/agenteTome.js');

    if (operation === 'status' && req.method === 'GET') {
      const runtimeStatus = module.getAgenteTomeRuntimeStatus();
      return writeJson(res, 200, {
        status: runtimeStatus.status,
        generatedAt: new Date().toISOString(),
        data: runtimeStatus,
      });
    }

    if (operation === 'admin-manifest' && req.method === 'GET') {
      const administrator = String(requestValue(req.query.admin) ?? '').trim();
      const cut = String(requestValue(req.query.corte) ?? 'recente') as 'recente' | 'competencia';
      const competence = requestValue(req.query.competencia);
      const requestFingerprint = module.buildAgenteTomeRequestFingerprint({ administrator, cut, competence });
      const result = await auditedCall(module, {
        operation: 'admin_manifest', requestedBy: user.id, administrator, competence, requestFingerprint,
      }, () => module.fetchAgenteTomeAdminManifest({ administrator, cut, competence }));
      return writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data: result.data });
    }

    if (operation === 'admin-export' && req.method === 'POST') {
      const body = readBody(req);
      const administrator = String(body.admin ?? body.administrator ?? '').trim();
      const cut = String(body.corte ?? body.cut ?? 'recente') as 'recente' | 'competencia';
      const competence = typeof (body.competencia ?? body.competence) === 'string' ? String(body.competencia ?? body.competence) : undefined;
      const format = String(body.formato ?? body.format ?? 'csv') as 'csv' | 'xlsx';
      const requestFingerprint = module.buildAgenteTomeRequestFingerprint({ administrator, cut, competence, format });
      const result = await auditedCall(module, {
        operation: 'admin_export', requestedBy: user.id, administrator, competence, format, requestFingerprint,
      }, () => module.requestAgenteTomeAdminExport({ administrator, cut, competence, format }));
      return writeJson(res, result.providerError ? 207 : 200, {
        status: result.providerError ? 'partial' : 'real', generatedAt: new Date().toISOString(), data: result.data,
        warning: 'O link de download é temporário e não é persistido pela plataforma.',
      });
    }

    if (operation === 'validate-xml' && req.method === 'POST') {
      const body = readBody(req);
      const xmlBase64 = typeof body.xmlBase64 === 'string' ? body.xmlBase64 : typeof body.xml_base64 === 'string' ? body.xml_base64 : '';
      const result = await auditedCall(module, { operation: 'validate_fidc_xml', requestedBy: user.id }, () => module.validateAgenteTomeXml(xmlBase64));
      const ok = result.data.ok === true && !result.providerError;
      return writeJson(res, ok ? 200 : 207, {
        status: ok ? 'real' : 'partial', generatedAt: new Date().toISOString(), data: result.data,
        metadata: { requestFingerprint: result.requestFingerprint, xmlBytes: result.xmlBytes, rawXmlPersisted: false },
      });
    }

    return writeJson(res, 404, { status: 'partial', generatedAt: new Date().toISOString(), error: `Operação Agentetome não encontrada: ${operation}.` });
  } catch (error) {
    console.error('[agentetome]', error);
    return writeJson(res, errorStatusCode(error), {
      status: 'partial', generatedAt: new Date().toISOString(), error: errorMessage(error), retryAfterSeconds: retryAfterSeconds(error),
    });
  }
}
