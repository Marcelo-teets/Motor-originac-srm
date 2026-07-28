import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './vercelTypes.js';
import { fetchFidcsFundSnapshot, normalizeCnpj, type FidcsFundSnapshot } from '../backend/src/lib/fidcsComBr.js';

type FidcsRequest = VercelRequest & { body?: unknown };
type AuthenticatedUser = { id: string; authorization: string };
type SourceRow = { id: string; name: string; status: string; health: string | null; metadata?: Record<string, unknown> };

class ApiError extends Error {
  constructor(message: string, readonly statusCode = 500) {
    super(message);
    this.name = 'ApiError';
  }
}

const RUNTIME = 'fidcs-com-br-v1';
const SOURCE_CODE = 'src_fidcs_com_br';
const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const errorStatus = (error: unknown) => typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;

const writeJson = (res: VercelResponse, statusCode: number, payload: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Origination-Runtime', RUNTIME);
  return res.status(statusCode).json(payload);
};

const runtimeConfig = () => {
  const supabaseUrl = normalizeBaseUrl(process.env.SUPABASE_URL ?? '');
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new ApiError('Supabase runtime não está configurado.', 503);
  return { supabaseUrl, anonKey, serviceRoleKey };
};

const serviceHeaders = () => {
  const { serviceRoleKey } = runtimeConfig();
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };
};

const authenticate = async (req: FidcsRequest): Promise<AuthenticatedUser> => {
  const authorization = requestValue(req.headers.authorization);
  if (!authorization?.startsWith('Bearer ')) throw new ApiError('Missing bearer token.', 401);
  const { supabaseUrl, anonKey } = runtimeConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof payload.id !== 'string') throw new ApiError('Unauthorized.', 401);
  return { id: payload.id, authorization };
};

const isCronAuthorized = (req: FidcsRequest) => {
  const secret = process.env.CRON_SECRET ?? '';
  const received = requestValue(req.headers.authorization) ?? '';
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return Boolean(secret && left.length === right.length && timingSafeEqual(left, right));
};

const requireGodMode = async (userId: string) => {
  const { supabaseUrl } = runtimeConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/user_profiles`);
  url.searchParams.set('select', 'id,role,status');
  url.searchParams.set('id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers: serviceHeaders() });
  const rows = await response.json().catch(() => []) as Array<{ role?: string; status?: string }>;
  if (!response.ok || rows[0]?.role !== 'god_mode' || rows[0]?.status !== 'active') {
    throw new ApiError('GOD-MODE ativo é obrigatório para esta operação.', 403);
  }
};

const serviceRpc = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  const { supabaseUrl } = runtimeConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: serviceHeaders(), body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: unknown;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (!response.ok) throw new ApiError(`RPC ${name} falhou (${response.status}): ${JSON.stringify(payload)}`, 502);
  return payload as T;
};

const findSource = async (): Promise<SourceRow> => {
  const { supabaseUrl } = runtimeConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/source_catalog`);
  url.searchParams.set('select', 'id,name,status,health,metadata');
  url.searchParams.set('metadata->>code', `eq.${SOURCE_CODE}`);
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers: serviceHeaders() });
  const rows = await response.json().catch(() => []) as SourceRow[];
  if (!response.ok || !rows[0]) throw new ApiError('Fonte FIDCS.com.br não encontrada no catálogo.', 503);
  return rows[0];
};

const updateSourceHealth = async (source: SourceRow, status: 'real' | 'partial', health: 'healthy' | 'degraded', details: Record<string, unknown>) => {
  const { supabaseUrl } = runtimeConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/source_catalog?id=eq.${source.id}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ status, health, metadata: { ...(source.metadata ?? {}), lastProbe: details }, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new ApiError(`Não foi possível atualizar a saúde do FIDCS.com.br (${response.status}).`, 502);
};

const insertRun = async (input: {
  sourceId: string; triggerType: 'manual' | 'cron'; status: 'completed' | 'partial' | 'failed';
  startedAt: string; finishedAt: string; itemsCollected: number; outputsWritten: number;
  errorMessage?: string | null; metadata: Record<string, unknown>;
}) => {
  const { supabaseUrl } = runtimeConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/source_connector_runs`, {
    method: 'POST', headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: crypto.randomUUID(), source_id: input.sourceId, scope_type: 'source', trigger_type: input.triggerType,
      status: input.status, started_at: input.startedAt, finished_at: input.finishedAt,
      items_collected: input.itemsCollected, outputs_written: input.outputsWritten,
      signals_written: 0, enrichments_written: 0, error_message: input.errorMessage ?? null,
      metadata: { sourceCode: SOURCE_CODE, runtime: RUNTIME, ...input.metadata },
    }),
  });
  if (!response.ok) console.warn('[fidcs.com.br] source_connector_runs insert failed', response.status, await response.text());
};

const latestFidcCnpjs = async (limit: number) => {
  const { supabaseUrl } = runtimeConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/capital_market_events`);
  url.searchParams.set('select', 'fund_cnpj,fund_name,reference_date');
  url.searchParams.set('instrument_type', 'eq.FIDC');
  url.searchParams.set('fund_cnpj', 'not.is.null');
  url.searchParams.set('order', 'reference_date.desc.nullslast,observed_at.desc');
  url.searchParams.set('limit', String(Math.min(limit * 10, 200)));
  const response = await fetch(url, { headers: serviceHeaders() });
  const rows = await response.json().catch(() => []) as Array<{ fund_cnpj?: string; fund_name?: string; reference_date?: string }>;
  if (!response.ok) throw new ApiError(`Falha ao selecionar FIDCs canônicos (${response.status}).`, 502);
  const seen = new Set<string>();
  return rows.filter((row) => {
    const cnpj = String(row.fund_cnpj ?? '').replace(/\D/g, '');
    if (cnpj.length !== 14 || seen.has(cnpj)) return false;
    seen.add(cnpj);
    return true;
  }).slice(0, limit).map((row) => ({ ...row, fund_cnpj: normalizeCnpj(String(row.fund_cnpj)) }));
};

const persistSnapshot = async (snapshot: FidcsFundSnapshot) => serviceRpc<string>('persist_fidcs_validation', { p_snapshot: snapshot });

const probeOne = async (cnpj: string) => {
  const snapshot = await fetchFidcsFundSnapshot(cnpj, { sessionCookie: process.env.FIDCS_SESSION_COOKIE });
  const outputId = await persistSnapshot(snapshot);
  return { outputId, snapshot };
};

const runBatch = async (source: SourceRow, triggerType: 'manual' | 'cron', requestedLimit: number) => {
  const startedAt = new Date().toISOString();
  const limit = Math.max(1, Math.min(Math.trunc(requestedLimit || 3), 10));
  const targets = await latestFidcCnpjs(limit);
  const results: Array<{ cnpj: string; ok: boolean; outputId?: string; warning?: boolean; error?: string }> = [];
  for (const target of targets) {
    try {
      const { outputId, snapshot } = await probeOne(target.fund_cnpj);
      results.push({ cnpj: target.fund_cnpj, ok: true, outputId, warning: snapshot.providerEdgeWarning });
    } catch (error) {
      results.push({ cnpj: target.fund_cnpj, ok: false, error: errorMessage(error) });
    }
  }
  const failures = results.filter((item) => !item.ok);
  const finishedAt = new Date().toISOString();
  const operational = results.some((item) => item.ok);
  const status = operational && failures.length === 0 ? 'completed' : operational ? 'partial' : 'failed';
  await insertRun({
    sourceId: source.id, triggerType, status, startedAt, finishedAt,
    itemsCollected: results.length, outputsWritten: results.filter((item) => item.ok).length,
    errorMessage: failures.map((item) => `${item.cnpj}: ${item.error}`).slice(0, 3).join(' | ') || null,
    metadata: { targets: targets.length, failures: failures.length, premiumSessionConfigured: Boolean(process.env.FIDCS_SESSION_COOKIE) },
  });
  await updateSourceHealth(source, operational ? 'real' : 'partial', operational ? 'healthy' : 'degraded', {
    status, startedAt, finishedAt, targets: targets.length, successes: results.length - failures.length,
    failures: failures.length, premiumSessionConfigured: Boolean(process.env.FIDCS_SESSION_COOKIE),
  });
  return { status, startedAt, finishedAt, targets, results };
};

export default async function handler(req: FidcsRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return res.status(204).json(null);
  }
  const operation = requestValue(req.query.operation) ?? 'status';
  try {
    const source = await findSource();
    if (operation === 'cron-run' && ['GET', 'POST'].includes(req.method ?? '')) {
      if (!isCronAuthorized(req)) throw new ApiError('Unauthorized FIDCS.com.br cron request.', 401);
      const result = await runBatch(source, 'cron', Number(requestValue(req.query.limit) ?? 3));
      return writeJson(res, result.status === 'completed' ? 200 : result.status === 'partial' ? 207 : 502, {
        status: result.status === 'completed' ? 'real' : 'partial', generatedAt: new Date().toISOString(), data: result,
      });
    }

    const user = await authenticate(req);
    if (operation === 'status' && req.method === 'GET') {
      const status = await serviceRpc<Record<string, unknown>>('fidcs_runtime_status', {});
      return writeJson(res, 200, { status: status.status ?? source.status, generatedAt: new Date().toISOString(), data: status });
    }
    if (operation === 'fund' && req.method === 'GET') {
      const cnpj = normalizeCnpj(String(requestValue(req.query.cnpj) ?? ''));
      const result = await probeOne(cnpj);
      await updateSourceHealth(source, 'real', 'healthy', {
        status: 'completed', finishedAt: new Date().toISOString(), cnpj,
        providerEdgeWarning: result.snapshot.providerEdgeWarning,
        premiumSessionConfigured: Boolean(process.env.FIDCS_SESSION_COOKIE),
      });
      return writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data: result });
    }
    if (operation === 'run' && req.method === 'POST') {
      await requireGodMode(user.id);
      const result = await runBatch(source, 'manual', Number(requestValue(req.query.limit) ?? 3));
      return writeJson(res, result.status === 'completed' ? 200 : result.status === 'partial' ? 207 : 502, {
        status: result.status === 'completed' ? 'real' : 'partial', generatedAt: new Date().toISOString(), data: result,
      });
    }
    return writeJson(res, 404, { status: 'partial', generatedAt: new Date().toISOString(), error: `Operação FIDCS.com.br não encontrada: ${operation}.` });
  } catch (error) {
    const statusCode = errorStatus(error);
    if (statusCode >= 500) console.error('[fidcs.com.br]', error);
    return writeJson(res, statusCode, { status: 'partial', generatedAt: new Date().toISOString(), error: errorMessage(error) });
  }
}
