import type { IncomingMessage, ServerResponse } from 'node:http';

type HealthStatus = 'healthy' | 'stale' | 'failed' | 'partial' | 'stale_running' | 'never_succeeded' | 'never_run';

type HealthRow = {
  dataset_code: string;
  latest_status: string | null;
  latest_trigger_type: string | null;
  latest_started_at: string | null;
  latest_finished_at: string | null;
  last_success_at: string | null;
  latest_age_seconds: number | null;
  latest_duration_seconds: number | null;
  files_processed: number | null;
  resources_skipped: number | null;
  records_seen: number | null;
  records_inserted: number | null;
  records_updated: number | null;
  records_unchanged: number | null;
  events_written: number | null;
  signals_written: number | null;
  runs_30d: number | null;
  successful_runs_30d: number | null;
  failed_runs_30d: number | null;
  success_rate_30d: string | number | null;
  error_message: string | null;
  health_status: HealthStatus;
};

const datasetLabels: Record<string, string> = {
  cvm_offers: 'Ofertas públicas',
  cvm_fund_registry: 'Cadastro de fundos',
  cvm_fidc_monthly: 'FIDC mensal',
  cvm_cri_monthly: 'CRI mensal',
  cvm_cra_monthly: 'CRA mensal',
  cvm_fii_monthly: 'FII mensal',
};

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
  });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const numberValue = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const getBuildInfo = () => ({
  gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? 'unknown',
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'local',
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  deploymentUrl: process.env.VERCEL_URL ?? null,
});

const requestUrl = (req: IncomingMessage) => new URL(req.url ?? '/', `https://${getHeader(req, 'host') ?? 'localhost'}`);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    writeJson(res, 405, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: 'Method not allowed.',
    });
    return;
  }

  if (requestUrl(req).searchParams.get('mode') === 'platform') {
    const mode = process.env.USE_SUPABASE === 'true' ? 'real' : 'partial';
    writeJson(res, 200, {
      status: mode,
      generatedAt: new Date().toISOString(),
      data: {
        service: 'backend',
        mode,
        uptime: process.uptime(),
        build: getBuildInfo(),
        runtime: 'lightweight-health-v1',
      },
    });
    return;
  }

  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) {
    writeJson(res, 401, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: 'Missing bearer token.',
    });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ? normalizeBaseUrl(process.env.SUPABASE_URL) : '';
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    writeJson(res, 503, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: 'Supabase is not configured for capital-market health.',
    });
    return;
  }

  const accessToken = authorization.slice('Bearer '.length);

  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!authResponse.ok) {
      const authBody = await authResponse.text();
      writeJson(res, 401, {
        status: 'partial',
        generatedAt: new Date().toISOString(),
        error: authBody.slice(0, 240) || 'Unauthorized.',
      });
      return;
    }

    const healthUrl = new URL(`${supabaseUrl}/rest/v1/capital_market_ingestion_health`);
    healthUrl.searchParams.set('select', '*');
    healthUrl.searchParams.set('order', 'dataset_code.asc');
    healthUrl.searchParams.set('limit', '20');

    const healthResponse = await fetch(healthUrl.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });

    if (!healthResponse.ok) {
      throw new Error(`Supabase health query failed: ${healthResponse.status} ${(await healthResponse.text()).slice(0, 240)}`);
    }

    const rows = await healthResponse.json() as HealthRow[];
    const datasets = rows.map((row) => ({
      datasetCode: row.dataset_code,
      label: datasetLabels[row.dataset_code] ?? row.dataset_code,
      latestStatus: row.latest_status,
      latestTriggerType: row.latest_trigger_type,
      latestStartedAt: row.latest_started_at,
      latestFinishedAt: row.latest_finished_at,
      lastSuccessAt: row.last_success_at,
      latestAgeSeconds: row.latest_age_seconds === null ? null : numberValue(row.latest_age_seconds),
      latestDurationSeconds: row.latest_duration_seconds === null ? null : numberValue(row.latest_duration_seconds),
      filesProcessed: numberValue(row.files_processed),
      resourcesSkipped: numberValue(row.resources_skipped),
      recordsSeen: numberValue(row.records_seen),
      recordsInserted: numberValue(row.records_inserted),
      recordsUpdated: numberValue(row.records_updated),
      recordsUnchanged: numberValue(row.records_unchanged),
      eventsWritten: numberValue(row.events_written),
      signalsWritten: numberValue(row.signals_written),
      runs30d: numberValue(row.runs_30d),
      successfulRuns30d: numberValue(row.successful_runs_30d),
      failedRuns30d: numberValue(row.failed_runs_30d),
      successRate30d: numberValue(row.success_rate_30d),
      errorMessage: row.error_message,
      healthStatus: row.health_status,
    }));

    const healthyDatasets = datasets.filter((dataset) => dataset.healthStatus === 'healthy').length;
    const neverRunDatasets = datasets.filter((dataset) => dataset.healthStatus === 'never_run').length;
    const attentionDatasets = datasets.length - healthyDatasets;

    writeJson(res, 200, {
      status: 'real',
      generatedAt: new Date().toISOString(),
      data: {
        summary: {
          totalDatasets: datasets.length,
          healthyDatasets,
          attentionDatasets,
          neverRunDatasets,
          recordsSeenLatest: datasets.reduce((sum, dataset) => sum + dataset.recordsSeen, 0),
          recordsInsertedLatest: datasets.reduce((sum, dataset) => sum + dataset.recordsInserted, 0),
          signalsWrittenLatest: datasets.reduce((sum, dataset) => sum + dataset.signalsWritten, 0),
        },
        datasets,
      },
    });
  } catch (error) {
    writeJson(res, 500, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
