export type CompanyCreditReviewOutcome = 'eligible' | 'monitor_only' | 'ineligible';
export type CompanyCreditReviewAction = 'save_draft' | 'approve' | 'materialize';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OUTCOMES = new Set<CompanyCreditReviewOutcome>(['eligible', 'monitor_only', 'ineligible']);

export class CompanyCreditReviewValidationError extends Error {
  readonly statusCode = 422;
  constructor(message: string, readonly blockers: string[] = []) {
    super(message);
    this.name = 'CompanyCreditReviewValidationError';
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CompanyCreditReviewValidationError('Review payload must be a JSON object.', ['invalid_review_payload']);
  }
  return value as Record<string, unknown>;
};

const requireUuid = (value: unknown, field: string) => {
  const normalized = String(value ?? '').trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new CompanyCreditReviewValidationError(`${field} must be a valid UUID.`, [`invalid_${field}`]);
  }
  return normalized;
};

export const normalizeCompanyCreditReviewAction = (value: unknown): CompanyCreditReviewAction => {
  const action = String(value ?? '').trim();
  if (action === 'save_draft' || action === 'approve' || action === 'materialize') return action;
  throw new CompanyCreditReviewValidationError('Unsupported company credit review action.', ['unsupported_action']);
};

export const normalizeCompanyCreditReviewDraft = (body: unknown) => {
  const input = asRecord(body);
  const payload = asRecord(input.reviewPayload ?? input.review_payload ?? input.payload);
  return {
    companyId: requireUuid(input.companyId ?? input.company_id, 'company_id'),
    reviewPayload: payload,
    reviewNotes: String(input.reviewNotes ?? input.review_notes ?? '').trim() || undefined,
  };
};

export const normalizeCompanyCreditReviewApproval = (body: unknown) => {
  const input = asRecord(body);
  const outcome = String(input.approvedOutcome ?? input.approved_outcome ?? '').trim() as CompanyCreditReviewOutcome;
  if (!OUTCOMES.has(outcome)) {
    throw new CompanyCreditReviewValidationError('approvedOutcome must be eligible, monitor_only or ineligible.', ['invalid_approved_outcome']);
  }
  return {
    reviewId: requireUuid(input.reviewId ?? input.review_id, 'review_id'),
    approvedOutcome: outcome,
    reviewNotes: String(input.reviewNotes ?? input.review_notes ?? '').trim() || undefined,
    materialize: input.materialize !== false,
  };
};

export const normalizeCompanyCreditReviewMaterialization = (body: unknown) => {
  const input = asRecord(body);
  return { companyId: requireUuid(input.companyId ?? input.company_id, 'company_id') };
};
