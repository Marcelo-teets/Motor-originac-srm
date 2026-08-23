import type { IncomingMessage, ServerResponse } from 'node:http';
import paperclipControlPlaneHandler from '../serverless/paperclip-control-plane.js';
import dcmOutreachLearningHandler from '../serverless/dcm-outreach-learning.js';

const RUNTIME = 'dcm-daily-operating-loop-v2-consolidated';

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Origination-Runtime': RUNTIME,
    'X-Robots-Tag': 'noindex',
  });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const parseUrl = (req: IncomingMessage) => {
  const host = getHeader(req, 'host') ?? 'localhost';
  return new URL((req as { url?: string }).url ?? '/', `https://${host}`);
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const view = parseUrl(req).searchParams.get('view') ?? 'loop';

  // Consolidate authenticated operational surfaces behind an existing Vercel
  // function so the Hobby deployment remains within the 12-function budget.
  // The delegated modules keep their own auth, validation and audit contracts.
  if (view === 'paperclip') {
    await paperclipControlPlaneHandler(req, res);
    return;
  }

  if (view === 'outreach-learning') {
    await dcmOutreachLearningHandler(req, res);
    return;
  }

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
  if (!supabaseUrl || !anonKey) {
    writeJson(res, 503, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Supabase Auth is not configured.' });
    return;
  }

  try {
    const accessToken = authorization.slice('Bearer '.length);
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    });
    if (!authResponse.ok) {
      writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized.' });
      return;
    }

    const module = await import('../backend/src/modules/dcmDailyOperatingLoop.js');
    const data = view === 'business-analyst'
      ? module.getBusinessAnalystAgent()
      : module.getDcmDailyOperatingLoop();

    writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data });
  } catch (error) {
    console.error('[dcm-daily-operating-loop]', error);
    writeJson(res, 500, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
