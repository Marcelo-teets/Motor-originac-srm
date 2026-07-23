import type { IncomingMessage, ServerResponse } from 'node:http';

const RUNTIME = 'company-decision-readiness-v1';

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
    'X-Origination-Runtime': RUNTIME,
  });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const statusCodeFromError = (error: unknown) => {
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
  const supabaseUrl = process.env.SUPABASE_URL ? normalizeBaseUrl(process.env.SUPABASE_URL) : '';
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    writeJson(res, 503, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Supabase is not configured for the Company Master gate.' });
    return;
  }
  try {
    const accessToken = authorization.slice('Bearer '.length);
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } });
    if (!authResponse.ok) {
      writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized.' });
      return;
    }
    const { getCompanyDecisionReadiness } = await import('../backend/src/lib/companyDecisionReadiness.js');
    const snapshot = await getCompanyDecisionReadiness();
    writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data: snapshot });
  } catch (error) {
    const statusCode = statusCodeFromError(error);
    if (statusCode === 503) {
      writeJson(res, 503, { status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
      return;
    }
    console.error('[company-decision-readiness]', error);
    writeJson(res, 500, { status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
  }
}
