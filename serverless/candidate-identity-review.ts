import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyActiveIdentity } from './neon-auth.js';

const RUNTIME = 'candidate-identity-review-v1';

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

const readJsonBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 64_000) throw new Error('Request body exceeds 64 KB.');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('JSON body must be an object.');
  return parsed as Record<string, unknown>;
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
    return;
  }

  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Missing bearer token.' });
    return;
  }

  try {
    const { user } = await verifyActiveIdentity(authorization.slice('Bearer '.length));
    const body = await readJsonBody(req);
    const action = String(body.action ?? 'approve');
    const candidateId = String(body.candidateId ?? body.candidate_id ?? '').trim();
    const reviewer = { userId: user.id, email: user.email };

    const {
      CandidateIdentityReviewValidationError,
      normalizeCandidateIdentityApprovalInput,
      normalizeCandidateIdentityRejectionInput,
    } = await import('../backend/src/lib/candidateIdentityReview.js');
    const { CandidateIdentityReviewRuntime } = await import('../backend/src/services/candidateIdentityReviewRuntime.js');
    const runtime = new CandidateIdentityReviewRuntime();

    if (action === 'reject') {
      const input = normalizeCandidateIdentityRejectionInput(candidateId, body, reviewer);
      const data = await runtime.reject(input);
      writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data });
      return;
    }
    if (action !== 'approve') {
      writeJson(res, 400, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unsupported action.' });
      return;
    }

    const input = normalizeCandidateIdentityApprovalInput(candidateId, body, reviewer);
    const data = await runtime.approve(input);
    writeJson(res, 201, { status: 'real', generatedAt: new Date().toISOString(), data });
  } catch (error) {
    const validationError = typeof error === 'object' && error !== null && 'statusCode' in error && Number((error as { statusCode?: unknown }).statusCode) === 422;
    const databaseConstraint = error instanceof Error && /23514|identity|CNPJ|candidate/i.test(error.message);
    if (validationError || databaseConstraint) {
      writeJson(res, 422, {
        status: 'partial',
        generatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        blockers: typeof error === 'object' && error !== null && 'blockers' in error
          ? (error as { blockers?: unknown }).blockers
          : [],
      });
      return;
    }
    console.error('[candidate-identity-review]', error);
    writeJson(res, 500, { status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
  }
}
