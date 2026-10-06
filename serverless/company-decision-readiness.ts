import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyActiveIdentity } from './neon-auth.js';
import { getHeader } from './http.js';

const RUNTIME = 'company-decision-readiness-v1';

const corsHeaders = (req: IncomingMessage) => ({
  'Access-Control-Allow-Origin': getHeader(req, 'origin') ?? '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '600',
  Vary: 'Origin',
});

const writeJson = (req: IncomingMessage, res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    ...corsHeaders(req),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
    'X-Origination-Runtime': RUNTIME,
  });
  res.end(JSON.stringify(payload));
};

const writeNoContent = (req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(204, {
    ...corsHeaders(req),
    'Cache-Control': 'public, max-age=600',
    'X-Origination-Runtime': RUNTIME,
  });
  res.end();
};

const statusCodeFromError = (error: unknown) => {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null;
  const value = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isInteger(value) ? value : null;
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method ?? 'GET').toUpperCase();

  // O frontend produtivo deve usar /api no mesmo domínio, mas o preflight
  // permanece suportado para previews, caches antigos e integrações externas.
  if (method === 'OPTIONS') {
    writeNoContent(req, res);
    return;
  }

  if (method !== 'GET') {
    writeJson(req, res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
    return;
  }

  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) {
    writeJson(req, res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Missing bearer token.' });
    return;
  }

  try {
    await verifyActiveIdentity(authorization.slice('Bearer '.length));

    const { getCompanyDecisionReadiness } = await import('../backend/src/lib/companyDecisionReadiness.js');
    const snapshot = await getCompanyDecisionReadiness();
    writeJson(req, res, 200, { status: 'real', generatedAt: new Date().toISOString(), data: snapshot });
  } catch (error) {
    const statusCode = statusCodeFromError(error);
    if (statusCode === 503) {
      writeJson(req, res, 503, { status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
      return;
    }
    console.error('[company-decision-readiness]', error);
    writeJson(req, res, 500, { status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
  }
}
