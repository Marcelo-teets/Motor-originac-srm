import { getDataClient } from '../lib/dataClient.js';
import { requireGodModeProfile } from '../lib/userProfiles.js';
import { normalizeCnpjIdentity } from '../lib/cnpjIdentity.js';

export type FidcHumanReviewDisposition = 'needs_evidence' | 'no_go' | 'refer_to_identity_review';

export type FidcHumanReviewSubmission = {
  cnpj: string;
  disposition: FidcHumanReviewDisposition;
  rationale: string;
  nextAction: string;
};

const allowed = new Set<FidcHumanReviewDisposition>([
  'needs_evidence', 'no_go', 'refer_to_identity_review',
]);

const rejected = (reason: string, statusCode = 400) =>
  Object.assign(new Error(reason), { statusCode });

// DB v5 FIDC source/review views and append-only constraint are numeric-only.
// Never remove alpha characters: that could read or write history under a
// different tax identity. This is a compatibility gate, not identity rejection.
export const normalizeFidcReviewCnpj = (input: unknown): string => {
  const cnpj = typeof input === 'string' ? normalizeCnpjIdentity(input) : '';
  if (/[A-Z]/.test(cnpj)) {
    throw rejected('Alphanumeric CNPJ review requires a versioned source/DB migration.', 422);
  }
  if (!/^\d{14}$/.test(cnpj)) throw rejected('CNPJ must contain exactly 14 digits.');
  return cnpj;
};

export const normalizeFidcHumanReviewSubmission = (input: unknown): FidcHumanReviewSubmission => {
  const body = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const cnpj = normalizeFidcReviewCnpj(body.cnpj);
  const disposition = body.disposition;
  const rationale = typeof body.rationale === 'string' ? body.rationale.trim() : '';
  const nextAction = typeof body.nextAction === 'string' ? body.nextAction.trim() : '';

  if (!/^\d{14}$/.test(cnpj)) throw rejected('CNPJ must contain exactly 14 digits.');
  if (typeof disposition !== 'string' || !allowed.has(disposition as FidcHumanReviewDisposition)) {
    throw rejected('Unsupported FIDC review disposition.');
  }
  if (rationale.length < 30 || rationale.length > 3000) {
    throw rejected('Review rationale must contain 30 to 3000 characters.');
  }
  if (nextAction.length < 10 || nextAction.length > 1000) {
    throw rejected('Review nextAction must contain 10 to 1000 characters.');
  }

  return { cnpj, disposition: disposition as FidcHumanReviewDisposition, rationale, nextAction };
};

const normalizedCnpj = normalizeFidcReviewCnpj;

export class FidcAssignorHumanReviewService {
  private readonly client = getDataClient();

  private requireClient() {
    if (!this.client) throw rejected('Neon persistent database is required for FIDC human reviews.', 503);
    return this.client;
  }

  async record(reviewer: { id: string; email?: string }, payload: unknown) {
    const validated = normalizeFidcHumanReviewSubmission(payload);
    await requireGodModeProfile(reviewer.id);
    const result = await this.requireClient().rpcAsUser<string>(
      'record_fidc_assignor_human_review_v5',
      {
        p_cnpj: validated.cnpj,
        p_disposition: validated.disposition,
        p_rationale: validated.rationale,
        p_next_action: validated.nextAction,
        p_reviewer_user_id: reviewer.id,
      },
      { id: reviewer.id, email: reviewer.email, role: 'authenticated' },
    );
    return {
      id: String(result),
      cnpj: validated.cnpj,
      disposition: validated.disposition,
      reviewRecorded: true,
      identityApproved: false,
      companyPromoted: false,
      creditQualified: false,
    };
  }

  async history(reviewer: { id: string }, cnpj: string) {
    const parsedCnpj = normalizedCnpj(cnpj);
    await requireGodModeProfile(reviewer.id);
    return this.requireClient().select('fidc_assignor_human_reviews_v5', {
      filters: [{ column: 'cnpj', operator: 'eq', value: parsedCnpj }],
      orderBy: { column: 'created_at', ascending: false },
      limit: 50,
    });
  }

  async latest(reviewer: { id: string }) {
    await requireGodModeProfile(reviewer.id);
    return this.requireClient().select('fidc_assignor_latest_human_review_v5', {
      select: 'id,cnpj,disposition,rationale,next_action,reviewer_user_id,reviewer_email,review_lane_at_decision,legal_name_at_decision,registration_status_at_decision,cvm_evidence_url,registry_evidence_url,cvm_reference_date,evidence_links,distinct_funds,created_at',
      orderBy: { column: 'cnpj', ascending: true },
      limit: 100,
    });
  }
}
