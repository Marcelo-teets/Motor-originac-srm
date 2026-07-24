import type {
  CandidateIdentityApprovalInput,
  CandidateIdentityRejectionInput,
  CandidateIdentityReviewResult,
} from '../lib/candidateIdentityReview.js';
import { getSupabaseClient } from '../lib/supabase.js';
import type { CandidateIdentityReviewExecutor } from './searchProfileCaptureService.js';

export class CandidateIdentityReviewRuntime implements CandidateIdentityReviewExecutor {
  private readonly client = getSupabaseClient();

  async approve(input: CandidateIdentityApprovalInput): Promise<CandidateIdentityReviewResult> {
    if (!this.client) throw new Error('Supabase is required for candidate identity approval.');
    return this.client.rpc<CandidateIdentityReviewResult>('approve_candidate_identity_review', {
      p_candidate_id: input.candidateId,
      p_legal_name: input.legalName,
      p_cnpj: input.cnpj,
      p_website: input.website,
      p_identity_source_url: input.identitySourceUrl,
      p_evidence_summary: input.evidenceSummary,
      p_confidence: input.confidence,
      p_reviewer_user_id: input.reviewerUserId ?? null,
      p_reviewer_email: input.reviewerEmail ?? null,
      p_review_notes: input.reviewNotes ?? null,
    });
  }

  async reject(input: CandidateIdentityRejectionInput): Promise<CandidateIdentityReviewResult> {
    if (!this.client) throw new Error('Supabase is required for candidate identity rejection.');
    return this.client.rpc<CandidateIdentityReviewResult>('reject_candidate_identity_review', {
      p_candidate_id: input.candidateId,
      p_reason: input.reason,
      p_reviewer_user_id: input.reviewerUserId ?? null,
      p_reviewer_email: input.reviewerEmail ?? null,
    });
  }
}
