import type { IncomingMessage, ServerResponse } from 'node:http';

const RUNTIME = 'company-credit-review-v1';

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

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const parseUrl = (req: IncomingMessage) => {
  const host = getHeader(req, 'host') ?? 'localhost';
  return new URL((req as IncomingMessage & { url?: string }).url ?? '/', `https://${host}`);
};

const readJsonBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 128_000) throw new Error('Request body exceeds 128 KB.');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('JSON body must be an object.');
  return parsed as Record<string, unknown>;
};

const authenticate = async (req: IncomingMessage) => {
  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) return null;

  const supabaseUrl = process.env.SUPABASE_URL ? normalizeBaseUrl(process.env.SUPABASE_URL) : '';
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not configured for company credit review.');
  }

  const accessToken = authorization.slice('Bearer '.length);
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string; email?: string };
  return user.id ? { userId: user.id, email: user.email } : null;
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method ?? 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method)) {
    writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
    return;
  }

  try {
    const reviewer = await authenticate(req);
    if (!reviewer) {
      writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized.' });
      return;
    }

    const { CompanyCreditReviewRuntime } = await import('../backend/src/services/companyCreditReviewRuntime.js');
    const runtime = new CompanyCreditReviewRuntime();

    if (method === 'GET') {
      const url = parseUrl(req);
      const companyId = url.searchParams.get('companyId');
      const limit = Number(url.searchParams.get('limit') ?? 100);
      const data = companyId
        ? await runtime.packet(reviewer, companyId)
        : await runtime.list(reviewer, limit);
      writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data });
      return;
    }

    const body = await readJsonBody(req);
    const {
      CompanyCreditReviewValidationError,
      normalizeCompanyCreditReviewAction,
      normalizeCompanyCreditReviewApproval,
      normalizeCompanyCreditReviewDraft,
      normalizeCompanyCreditReviewMaterialization,
    } = await import('../backend/src/lib/companyCreditReview.js');
    const action = normalizeCompanyCreditReviewAction(body.action);

    if (action === 'save_draft') {
      const input = normalizeCompanyCreditReviewDraft(body);
      const data = await runtime.saveDraft({ reviewer, ...input });
      writeJson(res, 201, { status: 'real', generatedAt: new Date().toISOString(), data });
      return;
    }

    if (action === 'approve') {
      const input = normalizeCompanyCreditReviewApproval(body);
      const data = await runtime.approve({ reviewer, ...input });
      writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data });
      return;
    }

    const input = normalizeCompanyCreditReviewMaterialization(body);
    const data = await runtime.materialize(reviewer, input.companyId);
    writeJson(res, data.status === 'completed' ? 200 : 207, {
      status: data.status === 'completed' ? 'real' : 'partial',
      generatedAt: new Date().toISOString(),
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : undefined;
    const blockers = typeof error === 'object' && error !== null && 'blockers' in error
      ? (error as { blockers?: unknown }).blockers
      : [];

    if (message === 'god_mode_required' || statusCode === 403) {
      writeJson(res, 403, { status: 'partial', generatedAt: new Date().toISOString(), error: 'god_mode_required' });
      return;
    }
    if (statusCode === 422 || /23514|evidence is incomplete|valid UUID|Unsupported|approvedOutcome|payload/i.test(message)) {
      writeJson(res, 422, { status: 'partial', generatedAt: new Date().toISOString(), error: message, blockers });
      return;
    }
    if (/not found/i.test(message)) {
      writeJson(res, 404, { status: 'partial', generatedAt: new Date().toISOString(), error: message });
      return;
    }
    console.error('[company-credit-review]', error);
    writeJson(res, 500, { status: 'partial', generatedAt: new Date().toISOString(), error: message });
  }
}
