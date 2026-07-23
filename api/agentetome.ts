import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifySupabaseJwt } from '../backend/src/lib/auth.js';
import {
  AgenteTomeError,
  buildAgenteTomeRequestFingerprint,
  fetchAgenteTomeAdminManifest,
  getAgenteTomeRuntimeStatus,
  recordAgenteTomeOperation,
  requestAgenteTomeAdminExport,
  summarizeAgenteTomePayload,
  validateAgenteTomeXml,
  type AgenteTomeAuditInput,
  type AgenteTomeCut,
  type AgenteTomeExportFormat,
} from '../backend/src/lib/agenteTome.js';

const MAX_JSON_BODY_BYTES = 7_250_000;

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const requestUrl = (req: IncomingMessage) => {
  const host = getHeader(req, 'host') ?? 'localhost';
  return new URL(req.url ?? '/', `https://${host}`);
};

const readJsonBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) throw new AgenteTomeError('Corpo da requisição acima do limite permitido.', 413);
    chunks.push(buffer);
  }
  if (!chunks.length) return {} as Record<string, unknown>;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new AgenteTomeError('JSON inválido.', 400);
  }
};

const authenticate = async (req: IncomingMessage) => {
  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) throw new AgenteTomeError('Missing bearer token.', 401);
  try {
    return await verifySupabaseJwt(authorization.slice('Bearer '.length));
  } catch (error) {
    throw new AgenteTomeError(error instanceof Error ? error.message : 'Unauthorized.', 401);
  }
};

const operationFromUrl = (url: URL) => url.searchParams.get('operation') ?? 'status';

const auditStatusForError = (error: unknown): AgenteTomeAuditInput['status'] => {
  if (error instanceof AgenteTomeError && [429, 503].includes(error.statusCode)) return 'blocked';
  return 'failed';
};

const errorStatusCode = (error: unknown) => error instanceof AgenteTomeError ? error.statusCode : 500;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unexpected error.';

async function auditedCall<T extends { data: Record<string, any>; httpStatus: number; durationMs: number; retryAfterSeconds?: number; providerError: boolean }>(
  input: Omit<AgenteTomeAuditInput, 'status' | 'responseSummary' | 'httpStatus' | 'retryAfterSeconds' | 'durationMs'>,
  runner: () => Promise<T>,
) {
  const startedAt = Date.now();
  try {
    const result = await runner();
    const runtimeMetadata = result as T & { requestFingerprint?: string; xmlBytes?: number };
    await recordAgenteTomeOperation({
      ...input,
      requestFingerprint: input.requestFingerprint ?? runtimeMetadata.requestFingerprint,
      status: result.providerError ? 'partial' : 'completed',
      responseSummary: {
        ...summarizeAgenteTomePayload(input.operation, result.data),
        ...(typeof runtimeMetadata.xmlBytes === 'number' ? { xmlBytes: runtimeMetadata.xmlBytes } : {}),
      },
      httpStatus: result.httpStatus,
      retryAfterSeconds: result.retryAfterSeconds,
      durationMs: result.durationMs,
    });
    return result;
  } catch (error) {
    await recordAgenteTomeOperation({
      ...input,
      status: auditStatusForError(error),
      responseSummary: { error: errorMessage(error) },
      httpStatus: errorStatusCode(error),
      retryAfterSeconds: error instanceof AgenteTomeError ? error.retryAfterSeconds : undefined,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  try {
    const user = await authenticate(req);
    const url = requestUrl(req);
    const operation = operationFromUrl(url);

    if (operation === 'status' && req.method === 'GET') {
      const runtimeStatus = getAgenteTomeRuntimeStatus();
      writeJson(res, 200, {
        status: runtimeStatus.status,
        generatedAt: new Date().toISOString(),
        data: runtimeStatus,
      });
      return;
    }

    if (operation === 'admin-manifest' && req.method === 'GET') {
      const administrator = String(url.searchParams.get('admin') ?? '').trim();
      const cut = String(url.searchParams.get('corte') ?? 'recente') as AgenteTomeCut;
      const competence = url.searchParams.get('competencia') ?? undefined;
      const requestFingerprint = buildAgenteTomeRequestFingerprint({ administrator, cut, competence });
      const result = await auditedCall({
        operation: 'admin_manifest',
        requestedBy: user.id,
        administrator,
        competence,
        requestFingerprint,
      }, () => fetchAgenteTomeAdminManifest({ administrator, cut, competence }));
      writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data: result.data });
      return;
    }

    if (operation === 'admin-export' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const administrator = String(body.admin ?? body.administrator ?? '').trim();
      const cut = String(body.corte ?? body.cut ?? 'recente') as AgenteTomeCut;
      const competence = body.competencia ?? body.competence;
      const format = String(body.formato ?? body.format ?? 'csv') as AgenteTomeExportFormat;
      const competenceValue = typeof competence === 'string' ? competence : undefined;
      const requestFingerprint = buildAgenteTomeRequestFingerprint({ administrator, cut, competence: competenceValue, format });
      const result = await auditedCall({
        operation: 'admin_export',
        requestedBy: user.id,
        administrator,
        competence: competenceValue,
        format,
        requestFingerprint,
      }, () => requestAgenteTomeAdminExport({ administrator, cut, competence: competenceValue, format }));
      writeJson(res, result.providerError ? 207 : 200, {
        status: result.providerError ? 'partial' : 'real',
        generatedAt: new Date().toISOString(),
        data: result.data,
        warning: 'O link de download é temporário e não é persistido pela plataforma.',
      });
      return;
    }

    if (operation === 'validate-xml' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const xmlBase64 = typeof body.xmlBase64 === 'string' ? body.xmlBase64 : typeof body.xml_base64 === 'string' ? body.xml_base64 : '';
      const result = await auditedCall({
        operation: 'validate_fidc_xml',
        requestedBy: user.id,
      }, () => validateAgenteTomeXml(xmlBase64));
      const ok = result.data.ok === true && !result.providerError;
      writeJson(res, ok ? 200 : 207, {
        status: ok ? 'real' : 'partial',
        generatedAt: new Date().toISOString(),
        data: result.data,
        metadata: {
          requestFingerprint: result.requestFingerprint,
          xmlBytes: result.xmlBytes,
          rawXmlPersisted: false,
        },
      });
      return;
    }

    writeJson(res, 404, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: `Operação Agentetome não encontrada: ${operation}.`,
    });
  } catch (error) {
    const statusCode = errorStatusCode(error);
    writeJson(res, statusCode, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: errorMessage(error),
      retryAfterSeconds: error instanceof AgenteTomeError ? error.retryAfterSeconds : undefined,
    });
  }
}
