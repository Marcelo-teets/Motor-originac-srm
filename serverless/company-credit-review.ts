import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyActiveIdentity } from './neon-auth.js';
import { readJsonObjectBody } from './http-body.js';

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

const readJsonBody = (req: IncomingMessage) => readJsonObjectBody(req, 128_000);

const authenticate = async (req: IncomingMessage) => {
  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) return null;

  try {
    const { user } = await verifyActiveIdentity(authorization.slice('Bearer '.length));
    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

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
