import type { IncomingMessage, ServerResponse } from 'node:http';
import { PublicDataOperationsService } from '../backend/src/services/publicDataOperationsService.js';

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
  });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    writeJson(res, 405, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: 'Method not allowed.',
    });
    return;
  }

  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) {
    writeJson(res, 401, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: 'Missing bearer token.',
    });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ? normalizeBaseUrl(process.env.SUPABASE_URL) : '';
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey) {
    writeJson(res, 503, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: 'Supabase authentication is not configured for public-data operations.',
    });
    return;
  }

  const accessToken = authorization.slice('Bearer '.length);
  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!authResponse.ok) {
      writeJson(res, 401, {
        status: 'partial',
        generatedAt: new Date().toISOString(),
        error: 'Unauthorized.',
      });
      return;
    }

    const result = await new PublicDataOperationsService().getSnapshot();
    writeJson(res, result.status === 'real' ? 200 : 207, {
      status: result.status,
      generatedAt: new Date().toISOString(),
      data: result.snapshot,
      ...(result.note ? { note: result.note } : {}),
    });
  } catch (error) {
    writeJson(res, 500, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
