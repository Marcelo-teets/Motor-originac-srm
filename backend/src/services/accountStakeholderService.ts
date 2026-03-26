import { getSupabaseClient } from '../lib/supabase.js';

export class AccountStakeholderService {
  private readonly client = getSupabaseClient();

  async listByCompany(companyId: string) {
    if (!this.client) return [];
    return this.client.select('account_stakeholders', {
      select: '*',
      orderBy: { column: 'updated_at', ascending: false },
      filters: [{ column: 'company_id', operator: 'eq', value: companyId }],
      limit: 100,
    }).catch(() => []);
  }
}
