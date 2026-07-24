import { getSupabaseClient } from '../lib/supabase.js';
import type { CompanyCreditReviewOutcome } from '../lib/companyCreditReview.js';

type UserProfileRow = { id: string; role: string; status: string };
type Reviewer = { userId: string; email?: string };

type ReviewApprovalResult = {
  reviewId?: string;
  companyId?: string;
  status?: string;
  approvedOutcome?: CompanyCreditReviewOutcome;
  decisionEligible?: boolean;
  decisionEligibilityReason?: string;
  reviewedAt?: string;
};

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
      const [{ createPlatformRepository }, { PlatformService }] = await Promise.all([
        import('../repositories/platformRepository.js'),
        import('./platformService.js'),
      ]);
      const service = new PlatformService(createPlatformRepository('supabase'));
      const snapshots = await service.recomputeDerivedData(companyId);
      return {
        status: 'completed',
        companyId,
        generatedAt: snapshots.generatedAt,
        qualificationCount: snapshots.qualifications.length,
        patternCount: snapshots.patterns.length,
        scoreCount: snapshots.scoreSnapshots.length,
        leadScoreCount: snapshots.leadScoreSnapshots.length,
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
