import { getSupabaseClient } from '../lib/supabase.js';

export class ObjectionIntelligenceService {
  private readonly client = getSupabaseClient();

  async listByCompany(companyId: string) {
    if (!this.client) return [];
    return this.client.select('objection_instances', {
      select: '*',
      orderBy: { column: 'updated_at', ascending: false },
      filters: [{ column: 'company_id', operator: 'eq', value: companyId }],
      limit: 100,
    }).catch(() => []);
  }

  async listPlaybook() {
    if (!this.client) return [];
    return this.client.select('objection_playbook', {
      select: '*',
      orderBy: { column: 'category', ascending: true },
      limit: 100,
    }).catch(() => []);
  }
}
