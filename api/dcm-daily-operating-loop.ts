import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyActiveIdentity } from '../serverless/neon-auth.js';
import { getHeader, parseRequestUrl } from '../serverless/http.js';

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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Missing bearer token.' });
    return;
  }

  try {
    const { user } = await verifyActiveIdentity(authorization.slice('Bearer '.length));
    const view = parseRequestUrl(req).searchParams.get('view') ?? 'loop';

    if (view === 'paperclip') {
      const { handlePaperclipControlPlane } = await import('../serverless/paperclip-control-plane.js');
      const result = await handlePaperclipControlPlane(req, { id: user.id, email: user.email });
      writeJson(res, result.statusCode, { status: 'real', generatedAt: new Date().toISOString(), data: result.data });
      return;
    }

    if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
      writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
      return;
    }

    const module = await import('../backend/src/modules/dcmDailyOperatingLoop.js');
    const data = view === 'business-analyst'
      ? module.getBusinessAnalystAgent()
      : module.getDcmDailyOperatingLoop();

    writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data });
  } catch (error) {
    const candidate = Number((error as { statusCode?: unknown })?.statusCode);
    const statusCode = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
    if (statusCode >= 500) console.error('[dcm-daily-operating-loop]', error);
    writeJson(res, statusCode, {
      status: statusCode >= 500 ? 'partial' : 'rejected',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
