import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyActiveIdentity } from '../backend/src/lib/identityGate.js';

const RUNTIME = 'dcm-daily-operating-loop-v1';

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
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
    return;
  }

  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Missing bearer token.' });
    return;
  }

  try {
    await verifyActiveIdentity(authorization.slice('Bearer '.length));

    const view = parseUrl(req).searchParams.get('view') ?? 'loop';
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
