import type { VercelRequest, VercelResponse } from './vercelTypes.js';
import {
  normalizeCandidateIdentityApprovalInput,
  normalizeCandidateIdentityRejectionInput,
} from '../backend/src/lib/candidateIdentityReview.js';
import { verifySupabaseJwt } from '../backend/src/lib/auth.js';
import { CandidateIdentityReviewRuntime } from '../backend/src/services/candidateIdentityReviewRuntime.js';
import {
  CandidateTriageRuntime,
  type CandidateEntityType,
  type CandidateTriageLane,
} from '../backend/src/services/candidateTriageRuntime.js';
import { createPlatformRepository } from '../backend/src/repositories/platformRepository.js';
import { PlatformService } from '../backend/src/services/platformService.js';

const RUNTIME_VERSION = 'candidate-triage-v1';
const ENTITY_TYPES: CandidateEntityType[] = [
  'operating_company',
  'regulated_credit_company',
  'investment_vehicle',
  'market_infrastructure',
  'regulated_financial_institution',
  'special_purpose_vehicle',
  'identity_incomplete',
];
const QUEUE_LANES: CandidateTriageLane[] = [
  'identity_review_queue',
  'vehicle_context_only',
  'market_infrastructure_context',
  'parent_resolution_required',
  'identity_enrichment_required',
];
const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

async function authenticatedUser(req: VercelRequest) {
  const authorization = requestValue(req.headers.authorization);
  if (!authorization?.startsWith('Bearer ')) return null;
  return verifySupabaseJwt(authorization.slice('Bearer '.length));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Origination-Runtime', RUNTIME_VERSION);
  if (!['GET', 'POST'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ status: 'error', error: 'method_not_allowed' });
  }

  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ status: 'error', error: 'unauthorized' });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ status: 'blocked', error: 'supabase_service_credentials_missing' });
    }

    const triage = new CandidateTriageRuntime();
    if (req.method === 'GET') {
      const queueLaneRaw = requestValue(req.query.queueLane);
      const entityTypeRaw = requestValue(req.query.entityType);
      const queueLane = QUEUE_LANES.includes(queueLaneRaw as CandidateTriageLane)
        ? queueLaneRaw as CandidateTriageLane
        : undefined;
      const entityType = ENTITY_TYPES.includes(entityTypeRaw as CandidateEntityType)
        ? entityTypeRaw as CandidateEntityType
        : undefined;
      const parsedLimit = Number(requestValue(req.query.limit) ?? 100);
      const data = await triage.list(user.id, {
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 100,
        queueLane,
        entityType,
      });
      return res.status(200).json({ status: 'real', runtimeVersion: RUNTIME_VERSION, data });
    }

    const body = typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)
      ? req.body as Record<string, unknown>
      : {};
    const action = String(body.action ?? requestValue(req.query.action) ?? '').trim();
    const candidateId = String(body.candidateId ?? body.candidate_id ?? requestValue(req.query.candidateId) ?? '').trim();
    if (!candidateId) return res.status(400).json({ status: 'error', error: 'candidate_id_required' });

    if (action === 'confirm_classification') {
      const finalEntityType = String(body.finalEntityType ?? body.final_entity_type ?? '') as CandidateEntityType;
      if (!ENTITY_TYPES.includes(finalEntityType)) {
        return res.status(422).json({ status: 'error', error: 'invalid_final_entity_type', allowed: ENTITY_TYPES });
      }
      const data = await triage.confirmClassification({
        userId: user.id,
        reviewerEmail: user.email,
        candidateId,
        finalEntityType,
        reviewNotes: String(body.reviewNotes ?? body.review_notes ?? '').trim() || undefined,
      });
      return res.status(200).json({ status: 'real', runtimeVersion: RUNTIME_VERSION, data });
    }

    await triage.requireGodMode(user.id);
    const identityRuntime = new CandidateIdentityReviewRuntime();
    if (action === 'approve_identity') {
      const input = normalizeCandidateIdentityApprovalInput(candidateId, body, { userId: user.id, email: user.email });
      const data = await identityRuntime.approve(input);
      if (data.companyId) {
        const platform = new PlatformService(createPlatformRepository('supabase'));
        await platform.refreshMonitoring(data.companyId).catch(() => undefined);
      }
      return res.status(200).json({
        status: 'real',
        runtimeVersion: RUNTIME_VERSION,
        data: { ...data, derivedDataRecomputeSkipped: true },
      });
    }

    if (action === 'reject_identity') {
      const input = normalizeCandidateIdentityRejectionInput(candidateId, body, { userId: user.id, email: user.email });
      const data = await identityRuntime.reject(input);
      return res.status(200).json({ status: 'real', runtimeVersion: RUNTIME_VERSION, data });
    }

    return res.status(400).json({
      status: 'error',
      error: 'invalid_action',
      allowed: ['confirm_classification', 'approve_identity', 'reject_identity'],
    });
  } catch (error) {
    const message = errorMessage(error);
    const statusCode = Number((error as { statusCode?: number })?.statusCode)
      || (message === 'god_mode_required' ? 403
        : /blocked|required|invalid|not eligible|below|out_of_range/i.test(message) ? 422 : 500);
    console.error('[candidate-triage]', error);
    return res.status(statusCode).json({
      status: 'failed',
      runtimeVersion: RUNTIME_VERSION,
      error: message,
    });
  }
}
