import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyActiveIdentity } from './neon-auth.js';
import { readJsonObjectBody } from './http-body.js';

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

const readJsonBody = (req: IncomingMessage) => readJsonObjectBody(req, 64_000);

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
    const requestStatus = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 500;
    if (requestStatus === 400 || requestStatus === 413) {
      writeJson(res, requestStatus, { status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
      return;
    }
    console.error('[candidate-identity-review]', error);
    writeJson(res, 500, { status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
  }
}
