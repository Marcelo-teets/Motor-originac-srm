/**
 * api/index.ts - Motor Originacao SRM - Vercel Serverless Handler
 *
 * Adapta o Express app para o runtime serverless do Vercel.
 * Remove o prefixo /api antes de passar ao Express, para que todas as
 * rotas existentes (app.get('/companies'), etc.) continuem sem mudancas.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

type ExpressLike = (req: IncomingMessage, res: ServerResponse, next?: () => void) => void;
type ProcessEmitWarning = typeof process.emitWarning;

const warningFilterState = globalThis as typeof globalThis & {
  __motorOriginacaoVercelWarningFilterInstalled?: boolean;
};

const warningCode = (value: unknown) => {
  if (value && typeof value === 'object' && 'code' in value) {
    return String((value as { code?: unknown }).code ?? '');
  }

  return typeof value === 'string' ? value : '';
};

const isDep0169Warning = (warning: string | Error, args: unknown[]) => {
  if (warningCode(warning) === 'DEP0169') return true;
  if (typeof warning === 'string' && warning.includes('DEP0169')) return true;
  if (warning instanceof Error && warning.message.includes('DEP0169')) return true;

  return args.some((arg) => warningCode(arg) === 'DEP0169'
    || (typeof arg === 'string' && arg.includes('DEP0169')));
};

if (!warningFilterState.__motorOriginacaoVercelWarningFilterInstalled) {
  warningFilterState.__motorOriginacaoVercelWarningFilterInstalled = true;
  const originalEmitWarning = process.emitWarning.bind(process) as ProcessEmitWarning;

  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    // Express/parseurl emits DEP0169 on Vercel's current Node runtime; it is logged as an error there.
    if (isDep0169Warning(warning, args)) return;
    (originalEmitWarning as (...params: unknown[]) => void)(warning, ...args);
  }) as ProcessEmitWarning;
}

let expressApp: ExpressLike | null = null;
let loadingPromise: Promise<void> | null = null;

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  const requestId = String(res.getHeader('x-request-id') ?? '');
  const body = payload && typeof payload === 'object' && !Array.isArray(payload) && !('requestId' in payload)
    ? { ...payload, requestId }
    : payload;
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const writeError = (res: ServerResponse, statusCode: number, code: string, error: string) => {
  writeJson(res, statusCode, {
    statusCode,
    code,
    generatedAt: new Date().toISOString(),
    error,
  });
};

const corsOrigins = () => (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const sameOrigin = (req: IncomingMessage, origin: string) => {
  const host = getHeader(req, 'host');
  return Boolean(host && (origin === `https://${host}` || origin === `http://${host}`));
};

const applyCorsHeaders = (req: IncomingMessage, res: ServerResponse) => {
  const origin = getHeader(req, 'origin');
  if (origin && (sameOrigin(req, origin) || corsOrigins().includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
};

const readRawBody = async (req: IncomingMessage) => {
  const parsedBody = (req as IncomingMessage & { body?: unknown }).body;
  if (typeof parsedBody === 'string') return parsedBody;
  if (parsedBody instanceof Buffer) return parsedBody.toString('utf8');
  if (parsedBody && typeof parsedBody === 'object') return JSON.stringify(parsedBody);

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const readJsonBody = async (req: IncomingMessage) => {
  const rawBody = await readRawBody(req);
  if (!rawBody.trim()) return {};

  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid JSON request body.');
  }
};

async function authLogin(req: IncomingMessage, res: ServerResponse) {
  applyCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    writeError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    writeError(res, 400, 'invalid_json', 'Invalid JSON request body.');
    return;
  }

  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');
  const captchaToken = typeof body.captchaToken === 'string' ? body.captchaToken : undefined;

  if (!email || !password) {
    writeError(res, 400, 'validation_error', 'Email e password sao obrigatorios.');
    return;
  }

  const { buildAuthSessionCookie, signInWithPassword, toPublicSession } = await import('../backend/src/lib/auth.js');

  try {
    const session = await signInWithPassword(email, password, captchaToken);
    res.setHeader('Set-Cookie', buildAuthSessionCookie(session));
    writeJson(res, 200, {
      status: 'real',
      generatedAt: new Date().toISOString(),
      data: toPublicSession(session),
    });
  } catch (error) {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;
    const code = typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'request_failed';
    writeError(res, statusCode, code, error instanceof Error ? error.message : 'Unexpected login error.');
  }
}

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
const hasSupabaseCredentials = () => envFlag('SUPABASE_URL') && (envFlag('SUPABASE_SERVICE_ROLE_KEY') || envFlag('SUPABASE_ANON_KEY'));
const isManagedProduction = () => process.env.APP_ENV === 'production'
  || process.env.VERCEL_ENV === 'production'
  || process.env.VERCEL_ENV === 'preview';
const resolveUseSupabase = () => process.env.USE_SUPABASE === 'true' || (!envFlag('USE_SUPABASE') && hasSupabaseCredentials());
const requireSupabaseRuntime = () => {
  const useSupabase = resolveUseSupabase();
  if (isManagedProduction() && !useSupabase) {
    throw new Error('Supabase runtime is required in managed production and preview. Memory fallback is disabled.');
  }
  return useSupabase;
};

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
  const supabaseConfigured = hasSupabaseCredentials();
  const canAccessCoreTables = checks.filter((check) => ['companies', 'source_catalog', 'monitoring_outputs', 'source_connector_runs'].includes(check.table)).every((check) => check.ok);
  const cronConfigured = envFlag('CRON_SECRET');
  const useSupabase = resolveUseSupabase();

  writeJson(res, supabaseConfigured && canAccessCoreTables ? 200 : 207, {
    status: supabaseConfigured && canAccessCoreTables ? 'real' : 'partial',
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
      canRunAgainstSupabase: supabaseConfigured && useSupabase,
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
    const repository = createPlatformRepository(requireSupabaseRuntime() ? 'supabase' : 'memory');
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

async function ensureApp(): Promise<void> {
  if (expressApp) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const mod = await import('../backend/src/server.js');
    expressApp = (mod as any).app ?? (mod as any).default;
    if (!expressApp) {
      throw new Error(
        'backend/src/server.ts nao exporta `app`. '
        + 'Adicione "export { app };" no final do arquivo.'
      );
    }
  })();

  return loadingPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const originalUrl = (req as any).url ?? '/';
  res.setHeader('x-request-id', getHeader(req, 'x-request-id') ?? crypto.randomUUID());
  const pathname = parseUrl(req).pathname;

  if (pathname === '/api/data-capture/health') {
    await captureHealth(req, res);
    return;
  }

  if (pathname === '/api/auth/login') {
    await authLogin(req, res);
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

  try {
    await ensureApp();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeJson(res, 503, { error: 'Backend initialization failed', detail: msg });
    return;
  }

  // Remove prefixo /api: /api/companies -> /companies
  (req as any).url = originalUrl.replace(/^\/api(?=\/|$)/, '') || '/';

  (expressApp as ExpressLike)(req, res, () => {
    writeJson(res, 404, { error: 'Not found', path: (req as any).url });
  });
}
