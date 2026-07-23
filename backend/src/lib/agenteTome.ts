import { createHash } from 'node:crypto';
import { env } from './env.js';
import { getSupabaseClient } from './supabase.js';

const SOURCE_CODE = 'src_agentetome_api';
const SOURCE_NAME = 'Agente Tomé API / MCP';
const DEFAULT_BASE_URL = 'https://www.agentetome.com';
const DEFAULT_MCP_URL = 'https://www.agentetome.com/api/mcp';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_XML_BYTES = 5 * 1024 * 1024;

export type AgenteTomeOperation = 'validate_fidc_xml' | 'admin_manifest' | 'admin_export';
export type AgenteTomeRunStatus = 'completed' | 'partial' | 'failed' | 'blocked';
export type AgenteTomeCut = 'recente' | 'competencia';
export type AgenteTomeExportFormat = 'csv' | 'xlsx';

export type AgenteTomeAuditInput = {
  operation: AgenteTomeOperation;
  status: AgenteTomeRunStatus;
  requestedBy?: string;
  administrator?: string;
  competence?: string;
  format?: string;
  requestFingerprint?: string;
  responseSummary?: Record<string, unknown>;
  httpStatus?: number;
  retryAfterSeconds?: number;
  durationMs?: number;
};

export type AgenteTomeCallResult<T> = {
  data: T;
  httpStatus: number;
  durationMs: number;
  retryAfterSeconds?: number;
  providerError: boolean;
};

export class AgenteTomeError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
    readonly retryAfterSeconds?: number,
    readonly providerPayload?: unknown,
  ) {
    super(message);
    this.name = 'AgenteTomeError';
  }
}

const apiBaseUrl = () => (env.agenteTomeApiBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
const mcpUrl = () => env.agenteTomeMcpUrl || DEFAULT_MCP_URL;

const requireApiKey = () => {
  if (!env.agenteTomeApiKey) {
    throw new AgenteTomeError('AGENTETOME_API_KEY não está configurada no runtime.', 503);
  }
  return env.agenteTomeApiKey;
};

const parseRetryAfter = (value: string | null) => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
};

const parseJsonText = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { text: value };
  }
};

const fingerprint = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export const decodeAgenteTomeXmlBase64 = (xmlBase64: string) => {
  const compact = String(xmlBase64 ?? '').replace(/\s+/g, '');
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new AgenteTomeError('xmlBase64 inválido.', 400);
  }

  const xml = Buffer.from(compact, 'base64');
  if (!xml.length) throw new AgenteTomeError('O XML está vazio.', 400);
  if (xml.length > MAX_XML_BYTES) throw new AgenteTomeError('O XML excede o limite de 5 MB do Agentetome.', 413);
  if (!xml.toString('utf8', 0, Math.min(xml.length, 256)).trimStart().startsWith('<')) {
    throw new AgenteTomeError('O conteúdo decodificado não parece ser XML.', 422);
  }

  return {
    normalizedBase64: xml.toString('base64'),
    bytes: xml.length,
    sha256: fingerprint(xml),
  };
};

export const getAgenteTomeRuntimeStatus = () => ({
  provider: 'agentetome',
  sourceCode: SOURCE_CODE,
  configured: Boolean(env.agenteTomeApiKey),
  status: env.agenteTomeApiKey ? 'real' as const : 'partial' as const,
  apiBaseUrl: apiBaseUrl(),
  mcpUrl: mcpUrl(),
  capabilities: ['validate_fidc_xml', 'admin_manifest', 'admin_export'],
  limits: {
    xmlValidationPerMinute: 30,
    adminExportsPerHour: 10,
    xmlMaxBytes: MAX_XML_BYTES,
    honorRetryAfter: true,
  },
  persistence: {
    rawXml: false,
    signedDownloadLink: false,
    auditTable: 'agentetome_operation_runs',
  },
});

async function callMcpTool<T>(name: string, args: Record<string, unknown>): Promise<AgenteTomeCallResult<T>> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(mcpUrl(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${requireApiKey()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });

    const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
    const raw = await response.text();
    const payload = parseJsonText(raw) as any;
    if (!response.ok) {
      throw new AgenteTomeError(
        `Agentetome retornou HTTP ${response.status}.`,
        response.status,
        retryAfterSeconds,
        payload,
      );
    }
    if (payload?.error) {
      throw new AgenteTomeError(
        String(payload.error?.message ?? 'Erro JSON-RPC retornado pelo Agentetome.'),
        502,
        retryAfterSeconds,
        payload.error,
      );
    }

    const content = Array.isArray(payload?.result?.content) ? payload.result.content : [];
    const text = content.find((item: any) => item?.type === 'text' && typeof item?.text === 'string')?.text;
    if (!text) throw new AgenteTomeError('Resposta MCP sem conteúdo textual.', 502);

    return {
      data: parseJsonText(text) as T,
      httpStatus: response.status,
      retryAfterSeconds,
      durationMs: Date.now() - startedAt,
      providerError: Boolean(payload?.result?.isError),
    };
  } catch (error) {
    if (error instanceof AgenteTomeError) throw error;
    const message = error instanceof Error ? error.message : 'unknown_error';
    throw new AgenteTomeError(`Falha ao chamar Agentetome MCP: ${message}.`, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateAgenteTomeXml(xmlBase64: string) {
  const decoded = decodeAgenteTomeXmlBase64(xmlBase64);
  const result = await callMcpTool<Record<string, unknown>>('validar_informe_xml', {
    xml_base64: decoded.normalizedBase64,
  });

  return {
    ...result,
    requestFingerprint: decoded.sha256,
    xmlBytes: decoded.bytes,
  };
}

export async function fetchAgenteTomeAdminManifest(input: {
  administrator: string;
  cut?: AgenteTomeCut;
  competence?: string;
}): Promise<AgenteTomeCallResult<Record<string, unknown>>> {
  const administrator = input.administrator.trim();
  if (!administrator) throw new AgenteTomeError('admin é obrigatório.', 400);
  const cut = input.cut ?? 'recente';
  if (!['recente', 'competencia'].includes(cut)) throw new AgenteTomeError('corte inválido.', 400);
  if (cut === 'competencia' && input.competence && !/^\d{4}-\d{2}$/.test(input.competence)) {
    throw new AgenteTomeError('competencia deve estar no formato YYYY-MM.', 400);
  }

  const url = new URL(`${apiBaseUrl()}/api/v1/export/admin/manifest`);
  url.searchParams.set('admin', administrator);
  url.searchParams.set('corte', cut);
  if (input.competence) url.searchParams.set('competencia', input.competence);

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${requireApiKey()}`,
      },
    });
    const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
    const payload = parseJsonText(await response.text()) as Record<string, unknown>;
    if (!response.ok) {
      throw new AgenteTomeError(
        `Agentetome manifest retornou HTTP ${response.status}.`,
        response.status,
        retryAfterSeconds,
        payload,
      );
    }
    return {
      data: payload,
      httpStatus: response.status,
      retryAfterSeconds,
      durationMs: Date.now() - startedAt,
      providerError: false,
    };
  } catch (error) {
    if (error instanceof AgenteTomeError) throw error;
    const message = error instanceof Error ? error.message : 'unknown_error';
    throw new AgenteTomeError(`Falha ao consultar manifest Agentetome: ${message}.`, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestAgenteTomeAdminExport(input: {
  administrator: string;
  cut?: AgenteTomeCut;
  competence?: string;
  format?: AgenteTomeExportFormat;
}) {
  const administrator = input.administrator.trim();
  if (!administrator) throw new AgenteTomeError('admin é obrigatório.', 400);
  const cut = input.cut ?? 'recente';
  const format = input.format ?? 'csv';
  if (!['recente', 'competencia'].includes(cut)) throw new AgenteTomeError('corte inválido.', 400);
  if (!['csv', 'xlsx'].includes(format)) throw new AgenteTomeError('formato inválido.', 400);
  if (cut === 'competencia' && input.competence && !/^\d{4}-\d{2}$/.test(input.competence)) {
    throw new AgenteTomeError('competencia deve estar no formato YYYY-MM.', 400);
  }

  const args: Record<string, unknown> = { admin: administrator, corte: cut, formato: format };
  if (input.competence) args.competencia = input.competence;
  return callMcpTool<Record<string, unknown>>('exportar_admin', args);
}

export const buildAgenteTomeRequestFingerprint = (input: Record<string, unknown>) => fingerprint(JSON.stringify(input));

export const summarizeAgenteTomePayload = (operation: AgenteTomeOperation, payload: Record<string, any>) => {
  if (operation === 'validate_fidc_xml') {
    return {
      ok: payload.ok ?? null,
      leiaute: payload.leiaute ?? null,
      contadores: payload.contadores ?? {},
    };
  }
  if (operation === 'admin_manifest') {
    return {
      schema_versao: payload.schema_versao ?? payload.schemaVersion ?? null,
      filtro: payload.filtro ?? {},
      arquivos: payload.arquivos ?? {},
      notas_metodo: payload.notas_metodo ?? undefined,
    };
  }
  return {
    arquivo: payload.arquivo ?? null,
    formato: payload.formato ?? null,
    tamanho_bytes: payload.tamanho_bytes ?? null,
    expira_em: payload.expira_em ?? null,
    manifest: payload.manifest ? {
      schema_versao: payload.manifest.schema_versao ?? null,
      filtro: payload.manifest.filtro ?? {},
      arquivos: payload.manifest.arquivos ?? {},
    } : null,
  };
};

let sourceIdPromise: Promise<string | undefined> | null = null;
const resolveSourceId = async () => {
  if (sourceIdPromise) return sourceIdPromise;
  sourceIdPromise = (async () => {
    const client = getSupabaseClient();
    if (!client) return undefined;
    const rows = await client.select('source_catalog', {
      select: 'id',
      filters: [{ column: 'name', value: SOURCE_NAME }],
      limit: 1,
    });
    const row = Array.isArray(rows) ? rows[0] as any : null;
    return typeof row?.id === 'string' ? row.id : undefined;
  })().catch(() => undefined);
  return sourceIdPromise;
};

export async function recordAgenteTomeOperation(input: AgenteTomeAuditInput) {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.insert('agentetome_operation_runs', [{
      id: crypto.randomUUID(),
      source_id: await resolveSourceId(),
      requested_by: input.requestedBy ?? null,
      operation: input.operation,
      status: input.status,
      administrator: input.administrator ?? null,
      competence: input.competence ?? null,
      format: input.format ?? null,
      request_fingerprint: input.requestFingerprint ?? null,
      response_summary: input.responseSummary ?? {},
      http_status: input.httpStatus ?? null,
      retry_after_seconds: input.retryAfterSeconds ?? null,
      duration_ms: input.durationMs ?? null,
      created_at: new Date().toISOString(),
    }]);
  } catch (error) {
    console.warn('Agentetome audit insert failed:', error instanceof Error ? error.message : error);
  }
}
