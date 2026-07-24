import { getSupabaseClient } from '../lib/supabase.js';

export type CandidateDecisionQueueQuery = {
  queue?: 'commercial' | 'market_map' | 'identity' | 'promoted' | 'all';
  priority?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

const queueValues = new Set(['commercial', 'market_map', 'identity', 'promoted', 'all']);
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
  private readonly client = getSupabaseClient();

  async list(query: CandidateDecisionQueueQuery = {}) {
    if (!this.client) throw new Error('Supabase client not configured for Candidate Decision Queue.');
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
