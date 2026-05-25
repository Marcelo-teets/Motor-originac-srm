/**
 * backend/frontend/api/index.ts — Motor Originação SRM — Backend Vercel Handler
 *
 * Este arquivo existe porque o projeto `motor-originac-srm-backend` na Vercel
 * usa `backend/frontend` como root efetivo de build. Sem este entrypoint, as
 * rotas /api/* caem no fallback HTML do shim de build e a captura não executa.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

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

async function captureHealth(req: IncomingMessage, res: ServerResponse) {
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
  const canAccessCoreTables = checks
    .filter((check) => ['companies', 'source_catalog', 'monitoring_outputs', 'source_connector_runs'].includes(check.table))
    .every((check) => check.ok);
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

  try {
    const url = parseUrl(req);
    const [{ createPlatformRepository }, { CaptureRuntimeService }] = await Promise.all([
      import('../../src/repositories/platformRepository.js'),
      import('../../src/services/captureRuntimeService.js'),
    ]);
    const repository = createPlatformRepository(process.env.USE_SUPABASE === 'true' ? 'supabase' : 'memory');
    const runtime = new CaptureRuntimeService(repository);
    const result = await runtime.run({
      companyId: url.searchParams.get('companyId') ?? undefined,
      sourceId: url.searchParams.get('sourceId') ?? undefined,
      triggerType,
      reason: triggerType === 'cron' ? 'vercel_cron' : 'manual_serverless_runtime',
    });
    writeJson(res, result.persisted.status === 'real' ? 200 : 207, { status: result.persisted.status, generatedAt: new Date().toISOString(), data: result });
  } catch (error) {
    writeJson(res, 500, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function ensureApp(): Promise<void> {
  if (expressApp) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const mod = await import('../../src/server.js');
    expressApp = (mod as any).app ?? (mod as any).default;
    if (!expressApp) {
      throw new Error('backend/src/server.ts não exporta `app`. Adicione "export { app };" no final do arquivo.');
    }
  })();

  return loadingPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const originalUrl = (req as any).url ?? '/';
  const pathname = parseUrl(req).pathname;

  if (pathname === '/api/data-capture/health' || pathname === '/data-capture/health') {
    await captureHealth(req, res);
    return;
  }

  if (pathname === '/api/data-capture/cron/run' || pathname === '/data-capture/cron/run') {
    await runCaptureRuntime(req, res, 'cron');
    return;
  }

  if (pathname === '/api/data-capture/run' || pathname === '/data-capture/run') {
    await runCaptureRuntime(req, res, 'manual');
    return;
  }

  try {
    await ensureApp();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeJson(res, 503, { error: 'Backend initialization failed', detail: msg });
    return;
  }

  (req as any).url = originalUrl.replace(/^\/api(?=\/|$)/, '') || '/';

  (expressApp as ExpressLike)(req, res, () => {
    writeJson(res, 404, { error: 'Not found', path: (req as any).url });
  });
}
