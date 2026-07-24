import { getSupabaseClient } from '../lib/supabase.js';

export type CandidateEntityType =
  | 'operating_company'
  | 'regulated_credit_company'
  | 'investment_vehicle'
  | 'market_infrastructure'
  | 'regulated_financial_institution'
  | 'special_purpose_vehicle'
  | 'identity_incomplete';

export type CandidateTriageLane =
  | 'identity_review_queue'
  | 'vehicle_context_only'
  | 'market_infrastructure_context'
  | 'parent_resolution_required'
  | 'identity_enrichment_required';

export type CandidateTriageQuery = {
  limit?: number;
  queueLane?: CandidateTriageLane;
  entityType?: CandidateEntityType;
};

type UserProfileRow = { id: string; role: string; status: string };

export class CandidateTriageRuntime {
  private readonly client = getSupabaseClient();

  private async assertGodMode(userId: string) {
    if (!this.client) throw new Error('Supabase is required for candidate triage.');
    const rows = await this.client.select('user_profiles', {
      select: 'id,role,status',
      filters: [{ column: 'id', value: userId }],
      limit: 1,
    }) as UserProfileRow[];
    const profile = rows[0];
    if (!profile || profile.role !== 'god_mode' || profile.status !== 'active') {
      const error = new Error('god_mode_required') as Error & { statusCode?: number };
      error.statusCode = 403;
      throw error;
    }
  }

  async list(userId: string, query: CandidateTriageQuery = {}) {
    await this.assertGodMode(userId);
    if (!this.client) throw new Error('Supabase is required for candidate triage.');
    const limit = Math.max(1, Math.min(Math.trunc(Number(query.limit ?? 100)), 500));
    return this.client.rpc<Record<string, unknown>>('get_candidate_identity_triage', {
      p_limit: limit,
      p_queue_lane: query.queueLane ?? null,
      p_entity_type: query.entityType ?? null,
    });
  }

  async confirmClassification(input: {
    userId: string;
    reviewerEmail?: string;
    candidateId: string;
    finalEntityType: CandidateEntityType;
    reviewNotes?: string;
  }) {
    await this.assertGodMode(input.userId);
    if (!this.client) throw new Error('Supabase is required for candidate classification review.');
    return this.client.rpc<Record<string, unknown>>('confirm_candidate_entity_classification', {
      p_candidate_id: input.candidateId,
      p_final_entity_type: input.finalEntityType,
      p_reviewer_user_id: input.userId,
      p_reviewer_email: input.reviewerEmail ?? null,
      p_review_notes: input.reviewNotes ?? null,
    });
  }
}
