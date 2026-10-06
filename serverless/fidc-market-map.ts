import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyActiveIdentity } from './neon-auth.js';
import { getHeader } from './http.js';

const RUNTIME = 'agentetome-fidc-market-map-v1';

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
    'X-Origination-Runtime': RUNTIME,
  });
  res.end(JSON.stringify(payload));
};

const queryRecord = (req: IncomingMessage): Record<string, unknown> => {
  const host = getHeader(req, 'host') ?? 'localhost';
  const url = new URL(req.url ?? '/', `https://${host}`);
  return Object.fromEntries(url.searchParams.entries());
};

const errorStatusCode = (error: unknown) => {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null;
  const value = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isInteger(value) ? value : null;
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
    return;
  }

  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Missing bearer token.' });
    return;
  }

  const accessToken = authorization.slice('Bearer '.length);
  try {
    await verifyActiveIdentity(accessToken);

    // Vercel bundles this API entrypoint as CommonJS while the backend package is
    // ESM. Import only after the auth gate so missing/invalid bearer requests
    // remain lightweight and always return the JSON 401 contract.
    const { getFidcMarketMapSnapshot, parseFidcMarketMapQuery } = await import('../backend/src/lib/fidcMarketMap.js');
    const filters = parseFidcMarketMapQuery(queryRecord(req));
    const snapshot = await getFidcMarketMapSnapshot(filters);
    writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data: snapshot });
  } catch (error) {
    const statusCode = errorStatusCode(error);
    if (statusCode === 400 || statusCode === 503) {
      writeJson(res, statusCode, {
        status: 'partial',
        generatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    console.error('[fidc-market-map]', error);
    writeJson(res, 500, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
