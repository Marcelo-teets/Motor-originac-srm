/**
 * api/index.ts — Motor Originação SRM — Vercel Serverless Handler
 *
 * Adapta o Express app para o runtime serverless do Vercel.
 * Remove o prefixo /api antes de passar ao Express, para que todas as
 * rotas existentes (app.get('/companies'), etc.) continuem sem mudanças.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

// Node 24 emite DEP0169 (url.parse) a partir das dependências internas do
// Express 4 (parseurl); nosso código usa apenas WHATWG URL. Filtramos somente
// esse código para manter os logs de produção limpos sem silenciar outras
// deprecations. Remoção definitiva depende de upgrade do Express.
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const code = typeof args[0] === 'object' && args[0] !== null
    ? (args[0] as { code?: string }).code
    : typeof args[1] === 'string' ? args[1] : undefined;
  if (code === 'DEP0169') return;
  return originalEmitWarning(warning as string, ...(args as [never]));
}) as typeof process.emitWarning;

type ExpressLike = (req: IncomingMessage, res: ServerResponse, next?: () => void) => void;

let expressApp: ExpressLike | null = null;
let loadingPromise: Promise<void> | null = null;

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const parseUrl = (req: IncomingMessage) => {
  const host = getHeader(req, 'host') ?? 'localhost';
  return new URL((req as any).url ?? '/', `https://${host}`);
};

const isAuthorizedCron = (req: IncomingMessage) => {
  const cronSecret = process.env.CRON_SECRET;
  const auth = getHeader(req, 'authorization');
  return Boolean(cronSecret && auth === `Bearer ${cronSecret}`);
};

const envFlag = (key: string) => Boolean(process.env[key] && String(process.env[key]).trim().length > 0);

const supabaseHost = () => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).host : null;
  } catch {
    return 'invalid-url';
  }
};

const supabaseKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const asNullableUuid = (value: string | null | undefined) => (value && uuidPattern.test(value) ? value : null);

async function supabaseCount(table: string) {
  const baseUrl = process.env.SUPABASE_URL;
  const key = supabaseKey();
  if (!baseUrl || !key) return { table, ok: false, count: null, error: 'missing_supabase_env' };

  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  url.searchParams.set('select', 'id');

  try {
    const response = await fetch(url.toString(), {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: '0-0',
        Prefer: 'count=exact',
      },
    });

    const contentRange = response.headers.get('content-range');
    const countValue = contentRange?.split('/').at(-1);
    const count = countValue && countValue !== '*' ? Number(countValue) : null;

    if (!response.ok) {
      const body = await response.text();
      return { table, ok: false, count, error: `${response.status} ${body.slice(0, 180)}` };
    }

    return { table, ok: true, count, error: null };
  } catch (error) {
    return { table, ok: false, count: null, error: error instanceof Error ? error.message : String(error) };
  }
}

type CaptureAuditRunInput = {
  triggerType: 'cron' | 'manual';
  status: 'completed' | 'partial' | 'failed';
  startedAt: string;
  finishedAt: string;
  companyId?: string | null;
  sourceId?: string | null;
  scopeType?: 'global' | 'company' | 'source';
  itemsCollected?: number;
  outputsWritten?: number;
  signalsWritten?: number;
  enrichmentsWritten?: number;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

async function insertCaptureAuditRun(input: CaptureAuditRunInput) {
  const baseUrl = process.env.SUPABASE_URL;
  const key = supabaseKey();
  if (!baseUrl || !key) return;

  const row = {
    id: crypto.randomUUID(),
    company_id: asNullableUuid(input.companyId),
    source_id: asNullableUuid(input.sourceId),
    scope_type: input.scopeType ?? (input.companyId ? 'company' : 'global'),
    trigger_type: input.triggerType,
    status: input.status,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    items_collected: input.itemsCollected ?? 0,
    outputs_written: input.outputsWritten ?? 0,
    signals_written: input.signalsWritten ?? 0,
    enrichments_written: input.enrichmentsWritten ?? 0,
    error_message: input.errorMessage ?? null,
    metadata: input.metadata ?? {},
  };

  try {
    const response = await fetch(`${baseUrl}/rest/v1/source_connector_runs`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      console.warn(`Capture audit insert failed: ${response.status} ${await response.text()}`);
    }
  } catch (error) {
    console.warn('Capture audit insert failed:', error instanceof Error ? error.message : error);
  }
}

async function captureHealth(req: IncomingMessage, res: ServerResponse) {
  // Contrato 401 (issue #133 §12): diagnóstico só com bearer válido. Sem
  // CRON_SECRET configurado o endpoint permanece fechado (fail-closed) —
  // nunca expor env/tabelas sem credencial. Espelha o gate de
  // backend/src/serverless/vercelServerlessHandler.ts (captureHealth).
  if (!isAuthorizedCron(req)) {
    writeJson(res, 401, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: 'Unauthorized capture diagnostics request.',
    });
    return;
  }

  const tables = [
    'companies',
    'source_catalog',
    'source_connector_runs',
    'monitoring_outputs',
    'company_signals',
    'enrichments',
    'qualification_snapshots',
    'company_patterns',
    'score_snapshots',
    'lead_score_snapshots',
    'pipeline',
  ];

  const checks = await Promise.all(tables.map((table) => supabaseCount(table)));
  const hasSupabaseCredentials = envFlag('SUPABASE_URL') && (envFlag('SUPABASE_SERVICE_ROLE_KEY') || envFlag('SUPABASE_ANON_KEY'));
  const canAccessCoreTables = checks.filter((check) => ['companies', 'source_catalog', 'monitoring_outputs', 'source_connector_runs'].includes(check.table)).every((check) => check.ok);
  const cronConfigured = envFlag('CRON_SECRET');
  const useSupabase = process.env.USE_SUPABASE === 'true' || (!envFlag('USE_SUPABASE') && hasSupabaseCredentials);

  writeJson(res, hasSupabaseCredentials && canAccessCoreTables ? 200 : 207, {
    status: hasSupabaseCredentials && canAccessCoreTables ? 'real' : 'partial',
    generatedAt: new Date().toISOString(),
    requestPath: parseUrl(req).pathname,
    env: {
      USE_SUPABASE: process.env.USE_SUPABASE ?? null,
      resolvedUseSupabase: useSupabase,
      SUPABASE_URL: envFlag('SUPABASE_URL'),
      SUPABASE_HOST: supabaseHost(),
      SUPABASE_ANON_KEY: envFlag('SUPABASE_ANON_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: envFlag('SUPABASE_SERVICE_ROLE_KEY'),
      CRON_SECRET: cronConfigured,
    },
    captureRuntime: {
      canRunAgainstSupabase: hasSupabaseCredentials && useSupabase,
      canAuthorizeWorkflow: cronConfigured,
      coreTablesAccessible: canAccessCoreTables,
    },
    tables: checks,
  });
}

async function runCaptureRuntime(req: IncomingMessage, res: ServerResponse, triggerType: 'cron' | 'manual') {
  if (!isAuthorizedCron(req)) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized capture runtime request.' });
    return;
  }

  const startedAt = new Date().toISOString();
  const url = parseUrl(req);
  const requestedCompanyId = url.searchParams.get('companyId');
  const requestedSourceId = url.searchParams.get('sourceId');

  try {
    const [{ createPlatformRepository }, { CaptureRuntimeService }] = await Promise.all([
      import('../backend/src/repositories/platformRepository.js'),
      import('../backend/src/services/captureRuntimeService.js'),
    ]);
    const repository = createPlatformRepository(process.env.USE_SUPABASE === 'true' ? 'supabase' : 'memory');
    const runtime = new CaptureRuntimeService(repository);
    const result = await runtime.run({
      companyId: requestedCompanyId ?? undefined,
      sourceId: requestedSourceId ?? undefined,
      triggerType,
      reason: triggerType === 'cron' ? 'vercel_cron' : 'manual_serverless_runtime',
    });
    const persistedErrors = Array.isArray(result.persisted.errors) ? result.persisted.errors : [];
    await insertCaptureAuditRun({
      triggerType,
      status: result.persisted.status === 'real' ? 'completed' : 'partial',
      startedAt,
      finishedAt: new Date().toISOString(),
      companyId: requestedCompanyId,
      sourceId: requestedSourceId,
      scopeType: requestedCompanyId ? 'company' : requestedSourceId ? 'source' : 'global',
      itemsCollected: result.outputsCollected,
      outputsWritten: result.persisted.outputsWritten,
      signalsWritten: result.persisted.signalsWritten,
      enrichmentsWritten: result.persisted.enrichmentsWritten,
      errorMessage: persistedErrors.length ? persistedErrors.slice(0, 3).join(' | ') : null,
      metadata: {
        auditVersion: 'capture_runtime_serverless_v1',
        reason: triggerType === 'cron' ? 'vercel_cron' : 'manual_serverless_runtime',
        requested: result.requested,
        companiesAvailable: result.companiesAvailable,
        sourcesAvailable: result.sourcesAvailable,
        companiesProcessed: result.companiesProcessed,
        documentsCollected: result.documentsCollected,
        persisted: result.persisted,
      },
    });
    writeJson(res, result.persisted.status === 'real' ? 200 : 207, { status: result.persisted.status, generatedAt: new Date().toISOString(), data: result });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await insertCaptureAuditRun({
      triggerType,
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      companyId: requestedCompanyId,
      sourceId: requestedSourceId,
      scopeType: requestedCompanyId ? 'company' : requestedSourceId ? 'source' : 'global',
      errorMessage,
      metadata: {
        auditVersion: 'capture_runtime_serverless_v1',
        requestPath: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
      },
    });
    writeJson(res, 500, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: errorMessage,
    });
  }
}

async function originationRuntime(req: IncomingMessage, res: ServerResponse) {
  const pathname = parseUrl(req).pathname.replace(/^\/api/, '');
  const mod = await import('../backend/src/modules/originationOperatingSystem.js');
  const payload = (() => {
    if (pathname === '/origination/os') return mod.getOriginationOperatingSystem();
    if (pathname === '/origination/backlog') return mod.getOriginationBacklog();
    if (pathname === '/origination/templates') return mod.getOriginationTemplates();
    if (pathname === '/origination/checklist') return mod.getOriginationChecklist();
    if (pathname === '/origination/execution-plan') return mod.getOriginationExecutionPlan();
    if (pathname === '/origination/skills') return mod.getOriginationOperatingSystem().skills;
    if (pathname === '/origination/flows') return mod.getOriginationOperatingSystem().flows;
    return null;
  })();

  if (!payload) {
    writeJson(res, 404, { error: 'Origination endpoint not found', path: pathname });
    return;
  }

  writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data: payload });
}

async function runConsolidatedHandler(pathname: string, req: IncomingMessage, res: ServerResponse) {
  let routeHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void> | void) | null = null;

  if (pathname === '/api/bounded-capture-run') {
    routeHandler = (await import('../serverless/bounded-capture-run.js')).default;
  } else if (pathname === '/api/bounded-capture-targets') {
    routeHandler = (await import('../serverless/bounded-capture-targets.js')).default;
  } else if (pathname === '/api/candidate-identity-review') {
    routeHandler = (await import('../serverless/candidate-identity-review.js')).default;
  } else if (pathname === '/api/company-credit-review') {
    routeHandler = (await import('../serverless/company-credit-review.js')).default;
  } else if (pathname === '/api/company-decision-readiness') {
    routeHandler = (await import('../serverless/company-decision-readiness.js')).default;
  } else if (pathname === '/api/fidc-market-map') {
    routeHandler = (await import('../serverless/fidc-market-map.js')).default;
  }

  if (!routeHandler) return false;
  await routeHandler(req, res);
  return true;
}

async function ensureApp(): Promise<void> {
  if (expressApp) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const mod = await import('../backend/src/server.js');
    expressApp = (mod as any).app ?? (mod as any).default;
    if (!expressApp) {
      throw new Error(
        'backend/src/server.ts não exporta `app`. ' +
        'Adicione "export { app };" no final do arquivo.'
      );
    }
  })();

  return loadingPromise;
}

async function runScheduledDiscovery(req: IncomingMessage, res: ServerResponse) {
  if (!isAuthorizedCron(req)) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized discovery runtime request.' });
    return;
  }

  try {
    const [{ createPlatformRepository }, { SearchProfileCaptureRuntime }, { SearchProfileCaptureService }, { runScheduledSearchProfiles }] = await Promise.all([
      import('../backend/src/repositories/platformRepository.js'),
      import('../backend/src/services/searchProfileCaptureRuntime.js'),
      import('../backend/src/services/searchProfileCaptureService.js'),
      import('../backend/src/services/searchProfileScheduledRunner.js'),
    ]);
    const repository = createPlatformRepository(process.env.USE_SUPABASE === 'true' ? 'supabase' : 'memory');
    const runtime = new SearchProfileCaptureRuntime(repository);
    const captureService = new SearchProfileCaptureService(runtime);
    const summary = await runScheduledSearchProfiles({
      listSearchProfiles: () => repository.listSearchProfiles(),
      listRuns: (searchProfileId: string) => runtime.listRuns(searchProfileId),
      runCapture: (searchProfileId, triggerMode) => captureService.runCapture(searchProfileId, triggerMode),
    });
    writeJson(res, summary.failed > 0 ? 207 : 200, {
      status: summary.failed > 0 ? 'partial' : process.env.USE_SUPABASE === 'true' ? 'real' : 'partial',
      generatedAt: new Date().toISOString(),
      data: summary,
    });
  } catch (error) {
    writeJson(res, 500, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Scheduled discovery failed.',
    });
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const originalUrl = (req as any).url ?? '/';
  const pathname = parseUrl(req).pathname;

  if (pathname === '/api/search-profiles/cron/run') {
    await runScheduledDiscovery(req, res);
    return;
  }

  if (pathname === '/api/data-capture/health') {
    await captureHealth(req, res);
    return;
  }

  if (pathname === '/api/data-capture/cron/run') {
    await runCaptureRuntime(req, res, 'cron');
    return;
  }

  if (pathname === '/api/data-capture/run') {
    await runCaptureRuntime(req, res, 'manual');
    return;
  }

  if (pathname.startsWith('/api/origination/')) {
    await originationRuntime(req, res);
    return;
  }

  if (await runConsolidatedHandler(pathname, req, res)) {
    return;
  }

  try {
    await ensureApp();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeJson(res, 503, { error: 'Backend initialization failed', detail: msg });
    return;
  }

  // Remove prefixo /api: /api/companies → /companies
  (req as any).url = originalUrl.replace(/^\/api(?=\/|$)/, '') || '/';

  (expressApp as ExpressLike)(req, res, () => {
    writeJson(res, 404, { error: 'Not found', path: (req as any).url });
  });
}
