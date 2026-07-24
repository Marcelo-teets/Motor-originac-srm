import { isValidCnpjChecksum } from './candidatePromotionReadiness.js';

export type CandidateIdentityApprovalInput = {
  candidateId: string;
  legalName: string;
  cnpj: string;
  website: string;
  identitySourceUrl: string;
  evidenceSummary: string;
  confidence: number;
  reviewerUserId?: string;
  reviewerEmail?: string;
  reviewNotes?: string;
};

export type CandidateIdentityRejectionInput = {
  candidateId: string;
  reason: string;
  reviewerUserId?: string;
  reviewerEmail?: string;
};

export type CandidateIdentityReviewResult = {
  candidateId: string;
  companyId?: string;
  companyCreated?: boolean;
  reviewStatus: 'approved' | 'rejected';
  decisionEligible?: boolean;
  classificationStatus?: string;
  generatedAt: string;
};

export class CandidateIdentityReviewValidationError extends Error {
  readonly statusCode = 422;

  constructor(readonly blockers: string[]) {
    super(`Candidate identity review blocked: ${blockers.join(', ')}`);
  }
}

const clean = (value: unknown) => String(value ?? '').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');

const validHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname);
  } catch {
    return false;
  }
};

export function normalizeCandidateIdentityApprovalInput(
  candidateId: string,
  raw: Record<string, unknown>,
  reviewer: { userId?: string; email?: string } = {},
): CandidateIdentityApprovalInput {
  const legalName = clean(raw.legalName ?? raw.legal_name);
  const cnpj = digits(raw.cnpj);
  const website = clean(raw.website);
  const identitySourceUrl = clean(raw.identitySourceUrl ?? raw.identity_source_url);
  const evidenceSummary = clean(raw.evidenceSummary ?? raw.evidence_summary);
  const confidence = Number(raw.confidence ?? 0.8);
  const reviewNotes = clean(raw.reviewNotes ?? raw.review_notes) || undefined;
  const blockers: string[] = [];

  if (!candidateId) blockers.push('candidate_id_required');
  if (legalName.length < 4) blockers.push('verified_legal_name_required');
  if (!isValidCnpjChecksum(cnpj)) blockers.push('valid_cnpj_required');
  if (!validHttpUrl(website)) blockers.push('valid_website_required');
  if (!validHttpUrl(identitySourceUrl)) blockers.push('identity_source_url_required');
  if (evidenceSummary.length < 80) blockers.push('identity_evidence_below_80_chars');
  if (!Number.isFinite(confidence) || confidence < 0.7 || confidence > 1) blockers.push('identity_confidence_out_of_range');

  if (blockers.length) throw new CandidateIdentityReviewValidationError(blockers);

  return {
    candidateId,
    legalName,
    cnpj,
    website,
    identitySourceUrl,
    evidenceSummary,
    confidence,
    reviewerUserId: reviewer.userId,
    reviewerEmail: reviewer.email,
    reviewNotes,
  };
}

export function normalizeCandidateIdentityRejectionInput(
  candidateId: string,
  raw: Record<string, unknown>,
  reviewer: { userId?: string; email?: string } = {},
): CandidateIdentityRejectionInput {
  const reason = clean(raw.reason ?? raw.reviewNotes ?? raw.review_notes);
  const blockers: string[] = [];
  if (!candidateId) blockers.push('candidate_id_required');
  if (reason.length < 20) blockers.push('rejection_reason_below_20_chars');
  if (blockers.length) throw new CandidateIdentityReviewValidationError(blockers);
  return { candidateId, reason, reviewerUserId: reviewer.userId, reviewerEmail: reviewer.email };
}
