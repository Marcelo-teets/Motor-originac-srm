import type { DiscoveredCandidateDraft } from './candidatePromotion.js';

export type CandidatePromotionCandidate = DiscoveredCandidateDraft & {
  candidateStatus: 'captured' | 'deduped' | 'promoted' | 'discarded';
  companyId?: string;
};

export type CandidatePromotionReadiness = {
  ready: boolean;
  blockers: string[];
};

export class CandidatePromotionBlockedError extends Error {
  readonly statusCode = 422;

  constructor(readonly blockers: string[]) {
    super(`Candidate promotion blocked: ${blockers.join(', ')}`);
  }
}

const digits = (value?: string) => String(value ?? '').replace(/\D/g, '');

export const isValidCnpjChecksum = (value?: string) => {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calculate = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = calculate(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (first !== Number(cnpj[12])) return false;
  const second = calculate(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return second === Number(cnpj[13]);
};

const asBoolean = (value: unknown) => value === true || value === 'true';

export function evaluateCandidatePromotionReadiness(candidate: CandidatePromotionCandidate): CandidatePromotionReadiness {
  const blockers: string[] = [];
  const raw = candidate.rawPayload ?? {};

  if (candidate.candidateStatus === 'discarded') blockers.push('candidate_discarded');
  if (candidate.candidateStatus === 'promoted') blockers.push('candidate_already_promoted');
  if (!isValidCnpjChecksum(candidate.cnpj)) blockers.push('invalid_or_missing_cnpj');
  if (!candidate.website?.trim()) blockers.push('missing_website');
  if (!candidate.normalizedDomain?.trim()) blockers.push('missing_normalized_domain');
  if (!String(raw.identity_evidence_url ?? '').trim()) blockers.push('identity_evidence_url_missing');
  if (!asBoolean(raw.legal_name_verified)) blockers.push('legal_name_not_verified');
  if (raw.identity_review_status !== 'approved') blockers.push('identity_review_not_approved');
  if (candidate.confidence < 0.70) blockers.push('confidence_below_070');
  if (candidate.evidenceSummary.trim().length < 40) blockers.push('insufficient_identity_evidence');
  if (!candidate.companyId) blockers.push('eligible_company_link_missing');

  return { ready: blockers.length === 0, blockers };
}

export function assertCandidatePromotionReady(candidate: CandidatePromotionCandidate) {
  const result = evaluateCandidatePromotionReadiness(candidate);
  if (!result.ready) throw new CandidatePromotionBlockedError(result.blockers);
  return result;
}
