import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyActiveIdentity } from '../serverless/neon-auth.js';
import { requireNeonDataClient } from '../serverless/neon-data.js';
import { readJsonObjectBody } from './http-body.js';

const RUNTIME = 'knowledge-hybrid-search-neon-v1';
const VOYAGE_MODEL = 'voyage-3.5';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Origination-Runtime': RUNTIME,
  });
  res.end(JSON.stringify(payload));
};

const header = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const readBody = (req: IncomingMessage) => readJsonObjectBody(req, 64_000);

const parseLimit = (value: unknown) => {
  const parsed = Number(value ?? 12);
  return Number.isFinite(parsed) ? Math.min(30, Math.max(1, Math.trunc(parsed))) : 12;
};

const generateQueryEmbedding = async (query: string) => {
  const apiKey = process.env.VOYAGE_API_KEY ?? '';
  if (!apiKey) return { embedding: null as number[] | null, fallbackReason: 'voyage_api_key_unavailable' };

  try {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: query,
        model: VOYAGE_MODEL,
        input_type: 'query',
        output_dimension: 1024,
        truncation: true,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { embedding: null as number[] | null, fallbackReason: `voyage_http_${response.status}` };
    const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1024 || embedding.some((item) => !Number.isFinite(item))) {
      return { embedding: null as number[] | null, fallbackReason: 'invalid_voyage_embedding' };
    }
    return { embedding, fallbackReason: null as string | null };
  } catch {
    return { embedding: null as number[] | null, fallbackReason: 'voyage_unavailable' };
  }
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    writeJson(res, 405, { status: 'error', error: 'method_not_allowed', runtime: RUNTIME });
    return;
  }

  try {
    const authorization = header(req, 'authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) {
      throw Object.assign(new Error('authentication_required'), { statusCode: 401 });
    }
    const identity = await verifyActiveIdentity(authorization.slice('Bearer '.length));
    const body = await readBody(req);
    const query = String(body.query ?? '').trim();
    const companyId = body.companyId ? String(body.companyId).trim() : null;
    const limit = parseLimit(body.limit);

    if (query.length < 2 || query.length > 500) {
      throw Object.assign(new Error('query_length_invalid'), { statusCode: 400 });
    }
    if (companyId && !UUID_PATTERN.test(companyId)) {
      throw Object.assign(new Error('company_id_invalid'), { statusCode: 400 });
    }

    const semantic = await generateQueryEmbedding(query);
    const payload = await requireNeonDataClient().rpcAsUser<Record<string, unknown>>(
      'knowledge_hybrid_search',
      {
        p_query_text: query,
        p_query_embedding: semantic.embedding ? `[${semantic.embedding.join(',')}]` : null,
        p_company_id: companyId,
        p_match_count: limit,
        p_rrf_k: 60,
      },
      { id: identity.user.id, email: identity.user.email, role: 'authenticated' },
    );

    writeJson(res, 200, {
      status: 'real',
      ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : { results: payload }),
      semantic: {
        available: Boolean(semantic.embedding),
        model: semantic.embedding ? VOYAGE_MODEL : null,
        dimensions: semantic.embedding?.length ?? null,
        fallbackReason: semantic.fallbackReason,
        syntheticEmbedding: false,
      },
      runtime: RUNTIME,
    });
  } catch (error) {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode) || 500
      : error instanceof SyntaxError ? 400 : 500;
    console.error('[knowledge-search]', error);
    writeJson(res, statusCode, {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      runtime: RUNTIME,
    });
  }
}
