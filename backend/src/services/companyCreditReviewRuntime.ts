import { getSupabaseClient } from '../lib/supabase.js';
import type { CompanyCreditReviewOutcome } from '../lib/companyCreditReview.js';

type UserProfileRow = { id: string; role: string; status: string };
type Reviewer = { userId: string; email?: string };
type CompanyRow = { id: string; stage?: string | null; metadata?: Record<string, unknown> | null };
type PipelineRow = { id: string; stage?: string | null; notes?: string | null };

type CreditReviewRow = {
  id: string;
  company_id: string;
  review_version: number;
  status: string;
  approved_outcome?: CompanyCreditReviewOutcome | null;
  has_credit_product?: boolean | null;
  credit_is_core?: boolean | null;
  credit_product_type?: string | null;
  has_receivables?: boolean | null;
  receivables_structurable?: boolean | null;
  receivables_type?: string[] | null;
  receivables_recurrence_level?: string | null;
  receivables_predictability_level?: string | null;
  has_fidc?: boolean | null;
  uses_structured_debt?: boolean | null;
  funding_structure_type?: string | null;
  capital_structure_quality?: string | null;
  funding_gap_level?: string | null;
  fit_fidc?: boolean | null;
  fit_dcm?: boolean | null;
  timing_level?: string | null;
  suggested_structure?: string | null;
  structural_score?: number | null;
  capital_score?: number | null;
  receivables_score?: number | null;
  execution_score?: number | null;
  timing_score?: number | null;
  confidence?: number | null;
  rationale?: string | null;
  next_action?: string | null;
  evidence?: unknown[] | null;
  reviewer_user_id?: string | null;
  reviewer_email?: string | null;
  reviewed_at?: string | null;
};

type ReviewApprovalResult = {
  reviewId?: string;
  companyId?: string;
  status?: string;
  approvedOutcome?: CompanyCreditReviewOutcome;
  decisionEligible?: boolean;
  decisionEligibilityReason?: string;
  reviewedAt?: string;
};

const asMetadata = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

export class CompanyCreditReviewRuntime {
  private readonly client = getSupabaseClient();

  private requireClient() {
    if (!this.client) throw new Error('Supabase is required for company credit review.');
    return this.client;
  }

  async requireGodMode(userId: string) {
    const client = this.requireClient();
    const rows = await client.select('user_profiles', {
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
    return profile;
  }

  async list(reviewer: Reviewer, limit = 100) {
    await this.requireGodMode(reviewer.userId);
    return this.requireClient().rpc<Record<string, unknown>>('get_company_credit_review_queue', {
      p_limit: Math.max(1, Math.min(Math.trunc(Number(limit) || 100), 500)),
    });
  }

  async packet(reviewer: Reviewer, companyId: string) {
    await this.requireGodMode(reviewer.userId);
    return this.requireClient().rpc<Record<string, unknown> | null>('get_company_credit_review_packet', {
      p_company_id: companyId,
    });
  }

  async saveDraft(input: {
    reviewer: Reviewer;
    companyId: string;
    reviewPayload: Record<string, unknown>;
    reviewNotes?: string;
  }) {
    await this.requireGodMode(input.reviewer.userId);
    return this.requireClient().rpc<Record<string, unknown>>('save_company_credit_review_draft', {
      p_company_id: input.companyId,
      p_payload: input.reviewPayload,
      p_reviewer_user_id: input.reviewer.userId,
      p_reviewer_email: input.reviewer.email ?? null,
      p_review_notes: input.reviewNotes ?? null,
    });
  }

  private async getReviewById(reviewId: string) {
    const rows = await this.requireClient().select('company_credit_reviews', {
      select: '*',
      filters: [{ column: 'id', value: reviewId }],
      limit: 1,
    }) as CreditReviewRow[];
    if (!rows[0]) throw new Error('credit review not found after approval');
    return rows[0];
  }

  private async getLatestApprovedReview(companyId: string) {
    const rows = await this.requireClient().select('company_credit_reviews', {
      select: '*',
      filters: [
        { column: 'company_id', value: companyId },
        { column: 'status', value: 'approved' },
      ],
      orderBy: { column: 'review_version', ascending: false },
      limit: 1,
    }) as CreditReviewRow[];
    return rows[0] ?? null;
  }

  private async syncReviewToCompany(review: CreditReviewRow) {
    const client = this.requireClient();
    const companyRows = await client.select('companies', {
      select: 'id,stage,metadata',
      filters: [{ column: 'id', value: review.company_id }],
      limit: 1,
    }) as CompanyRow[];
    const company = companyRows[0];
    if (!company) throw new Error('company not found while synchronizing credit review');

    const decisionEligible = review.status === 'approved' && review.approved_outcome === 'eligible';
    const metadata = {
      ...asMetadata(company.metadata),
      credit_review_id: review.id,
      credit_review_version: review.review_version,
      credit_review_status: review.status,
      credit_review_outcome: review.approved_outcome ?? null,
      credit_reviewed_at: review.reviewed_at ?? null,
      credit_reviewer_user_id: review.reviewer_user_id ?? null,
      credit_reviewer_email: review.reviewer_email ?? null,
      credit_classification_status: review.status,
      qualification_status: review.approved_outcome ?? 'pending',
      decision_eligible: decisionEligible,
      decision_eligibility_reason: decisionEligible
        ? 'credit_review_approved'
        : review.approved_outcome === 'monitor_only'
          ? 'credit_review_monitor_only'
          : 'credit_review_ineligible',
      excluded_from_qualification: !decisionEligible,
      excluded_from_scoring: !decisionEligible,
      credit_product_type: review.credit_product_type ?? null,
      credit_is_core: review.credit_is_core ?? null,
      credit_review_has_receivables: review.has_receivables ?? null,
      receivables_structurable: review.receivables_structurable ?? null,
      receivables_type: review.receivables_type ?? [],
      receivables_recurrence_level: review.receivables_recurrence_level ?? null,
      receivables_predictability_level: review.receivables_predictability_level ?? null,
      credit_review_has_fidc: review.has_fidc ?? null,
      credit_review_uses_structured_debt: review.uses_structured_debt ?? null,
      credit_review_funding_structure_type: review.funding_structure_type ?? null,
      capital_structure_quality: review.capital_structure_quality ?? null,
      funding_gap_level: review.funding_gap_level ?? null,
      credit_review_fit_fidc: review.fit_fidc ?? null,
      credit_review_fit_dcm: review.fit_dcm ?? null,
      timing_level: review.timing_level ?? null,
      suggested_structure: review.suggested_structure ?? null,
      credit_review_structural_score: review.structural_score ?? null,
      credit_review_capital_score: review.capital_score ?? null,
      credit_review_receivables_score: review.receivables_score ?? null,
      credit_review_execution_score: review.execution_score ?? null,
      credit_review_timing_score: review.timing_score ?? null,
      credit_review_confidence: review.confidence ?? null,
      credit_review_rationale: review.rationale ?? null,
      credit_review_next_action: review.next_action ?? null,
      credit_review_evidence: review.evidence ?? [],
    };

    await client.update('companies', {
      credit_product: Boolean(review.has_credit_product),
      has_receivables: Boolean(review.has_receivables),
      has_fidc: Boolean(review.has_fidc),
      has_structured_debt: Boolean(review.uses_structured_debt),
      funding_gap: ['medium', 'medium_high', 'high'].includes(String(review.funding_gap_level ?? '')),
      fit_fidc: Boolean(review.fit_fidc),
      fit_dcm: Boolean(review.fit_dcm),
      current_funding_structure: review.funding_structure_type ?? null,
      stage: decisionEligible ? 'Qualified' : company.stage ?? 'Identified',
      metadata,
      updated_at: new Date().toISOString(),
    }, [{ column: 'id', value: review.company_id }]);

    return { review, decisionEligible };
  }

  private async alignPipeline(review: CreditReviewRow) {
    const client = this.requireClient();
    const rows = await client.select('pipeline', {
      select: 'id,stage,notes',
      filters: [{ column: 'company_id', value: review.company_id }],
      limit: 1,
    }) as PipelineRow[];
    const pipeline = rows[0];
    if (!pipeline) return { status: 'not_found' };

    await client.update('pipeline', {
      stage: ['Identified', 'Qualified'].includes(String(pipeline.stage ?? '')) ? 'Qualified' : pipeline.stage,
      status: 'active',
      next_action: review.next_action ?? null,
      expected_structure: review.suggested_structure ?? null,
      notes: [pipeline.notes, `[credit_review_v1 review=${review.id}]`].filter(Boolean).join(' '),
      updated_at: new Date().toISOString(),
    }, [{ column: 'id', value: pipeline.id }]);
    return { status: 'updated', pipelineId: pipeline.id };
  }

  async approve(input: {
    reviewer: Reviewer;
    reviewId: string;
    approvedOutcome: CompanyCreditReviewOutcome;
    reviewNotes?: string;
    materialize?: boolean;
  }) {
    await this.requireGodMode(input.reviewer.userId);
    const approval = await this.requireClient().rpc<ReviewApprovalResult>('approve_company_credit_review', {
      p_review_id: input.reviewId,
      p_approved_outcome: input.approvedOutcome,
      p_reviewer_user_id: input.reviewer.userId,
      p_reviewer_email: input.reviewer.email ?? null,
      p_review_notes: input.reviewNotes ?? null,
    });
    const review = await this.getReviewById(input.reviewId);
    await this.syncReviewToCompany(review);

    if (approval.decisionEligible && input.materialize !== false && approval.companyId) {
      return {
        ...approval,
        materialization: await this.materialize(input.reviewer, approval.companyId),
      };
    }

    return { ...approval, materialization: { status: 'not_required' } };
  }

  async materialize(reviewer: Reviewer, companyId: string) {
    await this.requireGodMode(reviewer.userId);
    try {
      const review = await this.getLatestApprovedReview(companyId);
      if (!review || review.approved_outcome !== 'eligible') {
        throw new Error('approved eligible credit review is required before materialization');
      }
      await this.syncReviewToCompany(review);

      const [{ createPlatformRepository }, { PlatformService }] = await Promise.all([
        import('../repositories/platformRepository.js'),
        import('./platformService.js'),
      ]);
      const service = new PlatformService(createPlatformRepository('supabase'));
      const snapshots = await service.recomputeDerivedData(companyId);
      const pipeline = await this.alignPipeline(review);
      return {
        status: 'completed',
        companyId,
        generatedAt: snapshots.generatedAt,
        qualificationCount: snapshots.qualifications.length,
        patternCount: snapshots.patterns.length,
        scoreCount: snapshots.scoreSnapshots.length,
        leadScoreCount: snapshots.leadScoreSnapshots.length,
        pipeline,
      };
    } catch (error) {
      return {
        status: 'failed',
        companyId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
