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
  try {
    await ensureApp();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Backend initialization failed', detail: msg }));
    return;
  }

  // Remove prefixo /api: /api/companies → /companies
  const originalUrl = (req as any).url ?? '/';
  (req as any).url = originalUrl.replace(/^\/api(?=\/|$)/, '') || '/';

  (expressApp as ExpressLike)(req, res, () => {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: (req as any).url }));
  });
}
