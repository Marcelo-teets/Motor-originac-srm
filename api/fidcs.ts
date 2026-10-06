import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './vercelTypes.js';
import type { FidcsFundSnapshot } from '../backend/src/lib/fidcsComBr.js';
import { verifyActiveIdentity, verifyGodModeIdentity } from '../serverless/neon-auth.js';
import { requireNeonDataClient } from '../serverless/neon-data.js';
import { isCronAuthorized } from '../serverless/http.js';

type FidcsRequest = VercelRequest & { body?: unknown };
type SourceRow = { id: string; name: string; status: string; health: string | null; metadata?: Record<string, unknown> };

class ApiError extends Error {
  constructor(message: string, readonly statusCode = 500) { super(message); this.name = 'ApiError'; }
}

const RUNTIME = 'fidcs-com-br-v1';
const SOURCE_CODE = 'src_fidcs_com_br';
const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const errorStatus = (error: unknown) => typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;
const loadFidcsModule = () => import('../backend/src/lib/fidcsComBr.js');
const normalizeCnpjInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) throw new ApiError('CNPJ deve conter 14 dígitos.', 400);
  return digits;
};

const writeJson = (res: VercelResponse, statusCode: number, payload: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Origination-Runtime', RUNTIME);
  return res.status(statusCode).json(payload);
};

const authenticate = async (req: FidcsRequest) => {
  const authorization = requestValue(req.headers.authorization);
  if (!authorization?.startsWith('Bearer ')) throw new ApiError('Missing bearer token.', 401);
  const { user } = await verifyActiveIdentity(authorization.slice('Bearer '.length));
  return { id: user.id, authorization };
}

const requireGodMode = async (authorization: string) => {
  await verifyGodModeIdentity(authorization.slice('Bearer '.length));
}

const serviceRpc = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  try {
    return await requireNeonDataClient().rpc<T>(name, body);
  } catch (error) {
    throw new ApiError(`RPC ${name} falhou no Neon: ${errorMessage(error)}`, 502);
  }
};

const findSource = async (): Promise<SourceRow> => {
  const rows = await requireNeonDataClient().query<SourceRow>(
    `select id, name, status, health, metadata
       from public.source_catalog
      where metadata->>'code' = $1
      limit 1`,
    [SOURCE_CODE],
  );
  if (!rows[0]) throw new ApiError('Fonte FIDCS.com.br não encontrada no catálogo Neon.', 503);
  return rows[0];
};

const updateSourceHealth = async (
  source: SourceRow, status: 'real' | 'partial', health: 'healthy' | 'degraded', details: Record<string, unknown>,
) => {
  const rows = await requireNeonDataClient().update('source_catalog', {
    status,
    health,
    metadata: { ...(source.metadata ?? {}), lastProbe: details },
    updated_at: new Date().toISOString(),
  }, [{ column: 'id', operator: 'eq', value: source.id }]);
  if (!rows.length) throw new ApiError('Não foi possível atualizar a saúde do FIDCS.com.br no Neon.', 502);
};

const insertRun = async (input: {
  sourceId: string; triggerType: 'manual' | 'cron'; status: 'completed' | 'partial' | 'failed';
  startedAt: string; finishedAt: string; itemsCollected: number; outputsWritten: number;
  errorMessage?: string | null; metadata: Record<string, unknown>;
}) => {
  try {
    await requireNeonDataClient().insert('source_connector_runs', [{
      id: randomUUID(),
      source_id: input.sourceId,
      scope_type: 'source',
      trigger_type: input.triggerType,
      status: input.status,
      started_at: input.startedAt,
      finished_at: input.finishedAt,
      items_collected: input.itemsCollected,
      outputs_written: input.outputsWritten,
      signals_written: 0,
      enrichments_written: 0,
      error_message: input.errorMessage ?? null,
      metadata: { sourceCode: SOURCE_CODE, runtime: RUNTIME, ...input.metadata },
    }]);
  } catch (error) {
    console.warn('[fidcs.com.br] source_connector_runs insert failed', errorMessage(error));
  }
};

const latestFidcCnpjs = async (limit: number) => {
  const rows = await requireNeonDataClient().query<{ fund_cnpj?: string; fund_name?: string; reference_date?: string }>(
    `select fund_cnpj, fund_name, reference_date
       from public.capital_market_events
      where instrument_type = 'FIDC'
        and fund_cnpj is not null
      order by reference_date desc nulls last, observed_at desc
      limit $1`,
    [Math.min(limit * 10, 200)],
  );
  const seen = new Set<string>();
  return rows.filter((row) => {
    const cnpj = String(row.fund_cnpj ?? '').replace(/\D/g, '');
    if (cnpj.length !== 14 || seen.has(cnpj)) return false;
    seen.add(cnpj);
    return true;
  }).slice(0, limit).map((row) => ({ ...row, fund_cnpj: normalizeCnpjInput(String(row.fund_cnpj)) }));
};

const persistSnapshot = async (snapshot: FidcsFundSnapshot) => serviceRpc<string>('persist_fidcs_validation', { p_snapshot: snapshot });

const probeOne = async (cnpj: string) => {
  const { fetchFidcsFundSnapshot } = await loadFidcsModule();
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
      const cnpj = normalizeCnpjInput(String(requestValue(req.query.cnpj) ?? ''));
      const result = await probeOne(cnpj);
      await updateSourceHealth(source, 'real', 'healthy', {
        status: 'completed', finishedAt: new Date().toISOString(), cnpj,
        providerEdgeWarning: result.snapshot.providerEdgeWarning,
        premiumSessionConfigured: Boolean(process.env.FIDCS_SESSION_COOKIE),
      });
      return writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data: result });
    }
    if (operation === 'run' && req.method === 'POST') {
      await requireGodMode(user.authorization);
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
