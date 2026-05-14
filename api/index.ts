/**
 * api/index.ts — Motor Originação SRM — Vercel Serverless Handler
 *
 * Adapta o Express app para o runtime serverless do Vercel.
 * Remove o prefixo /api antes de passar ao Express, para que todas as
 * rotas existentes (app.get('/companies'), etc.) continuem sem mudanças.
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

async function runCaptureRuntime(req: IncomingMessage, res: ServerResponse, triggerType: 'cron' | 'manual') {
  if (!isAuthorizedCron(req)) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized capture runtime request.' });
    return;
  }

  try {
    const url = parseUrl(req);
    const [{ createPlatformRepository }, { CaptureRuntimeService }] = await Promise.all([
      import('../backend/src/repositories/platformRepository.js'),
      import('../backend/src/services/captureRuntimeService.js'),
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const originalUrl = (req as any).url ?? '/';
  const pathname = parseUrl(req).pathname;

  if (pathname === '/api/data-capture/cron/run') {
    await runCaptureRuntime(req, res, 'cron');
    return;
  }

  if (pathname === '/api/data-capture/run') {
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

  // Remove prefixo /api: /api/companies → /companies
  (req as any).url = originalUrl.replace(/^\/api(?=\/|$)/, '') || '/';

  (expressApp as ExpressLike)(req, res, () => {
    writeJson(res, 404, { error: 'Not found', path: (req as any).url });
  });
}
