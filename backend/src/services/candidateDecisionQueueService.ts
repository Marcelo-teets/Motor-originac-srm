import { getDataClient } from '../lib/dataClient.js';

export type CandidateDecisionQueueQuery = {
  queue?: 'commercial' | 'market_map' | 'identity' | 'promoted' | 'reviewable' | 'all';
  priority?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

const queueValues = new Set(['commercial', 'market_map', 'identity', 'promoted', 'reviewable', 'all']);
const integer = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

export const normalizeCandidateDecisionQueueQuery = (query: CandidateDecisionQueueQuery = {}) => ({
  queue: queueValues.has(String(query.queue)) ? String(query.queue) : 'commercial',
  priority: String(query.priority ?? '').trim() || null,
  search: String(query.search ?? '').trim().slice(0, 160) || null,
  limit: Math.min(Math.max(integer(query.limit, 50), 1), 200),
  offset: Math.max(integer(query.offset, 0), 0),
});

export class CandidateDecisionQueueService {
  private readonly client = getDataClient();

  async listFidcAssignors() {
    if (!this.client) throw new Error('Neon data client not configured for FIDC commercial review.');
    // Non-materialized, source-backed review queue. This endpoint never
    // promotes companies or treats registry identity as eligibility.
    const rows = await this.client.select('fidc_assignor_commercial_review_v5', {
      select: [
        'cnpj', 'cnpj_root', 'legal_name', 'registration_status',
        'registry_url', 'cvm_evidence_url', 'cvm_reference_date',
        'review_lane', 'recommended_review_action',
        'icp_eligibility_status', 'receivables_structurability_status',
        'funding_gap_status', 'distinct_funds', 'evidence_links',
        'auto_promotion_authorized',
      ].join(','),
      orderBy: { column: 'cnpj', ascending: true },
      limit: 100,
    });
    return {
      items: rows,
      stats: {
        total: rows.length,
        registered: rows.filter((row) => Boolean(row.legal_name)).length,
        needsIdentity: rows.filter((row) => !row.legal_name).length,
        exceptionReview: rows.filter((row) => row.review_lane === 'registration_exception_review').length,
        regulatedReview: rows.filter((row) => row.review_lane === 'regulated_entity_review').length,
      },
      promotionAllowed: false,
    };
  }

  async list(query: CandidateDecisionQueueQuery = {}) {
    if (!this.client) throw new Error('Neon data client not configured for Candidate Decision Queue.');
    const normalized = normalizeCandidateDecisionQueueQuery(query);
    return this.client.rpc('list_candidate_decision_queue', {
      p_queue: normalized.queue,
      p_priority: normalized.priority,
      p_search: normalized.search,
      p_limit: normalized.limit,
      p_offset: normalized.offset,
    });
  }
}
