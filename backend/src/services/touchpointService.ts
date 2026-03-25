import { getSupabaseClient } from '../lib/supabase.js';

export class TouchpointService {
  private readonly client = getSupabaseClient();

  async listByCompany(companyId: string) {
    if (!this.client) return [];
    return this.client.select('touchpoints', {
      select: '*',
      orderBy: { column: 'occurred_at', ascending: false },
      filters: [{ column: 'company_id', operator: 'eq', value: companyId }],
      limit: 100,
    }).catch(() => []);
  }
}
