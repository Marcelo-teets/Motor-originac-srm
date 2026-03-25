import { getSupabaseClient } from '../lib/supabase.js';
import type { Stakeholder } from './abmTypes.js';

const fallbackStakeholders: Stakeholder[] = [
  {
    id: 'stk_seed_neon_1',
    company_id: 'cmp_neon_receivables',
    name: 'Marina Costa',
    title: 'Head de Tesouraria',
    role_in_buying_committee: 'economic_buyer',
    champion_score: 76,
    blocker_score: 8,
    influence_score: 88,
    relationship_strength: 72,
    what_they_care_about: 'Alongar duration do funding.',
    known_objections: 'Complexidade operacional inicial.',
    last_contact_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

export class AccountStakeholderService {
  private readonly client = getSupabaseClient();

  async listByCompany(companyId: string) {
    if (!this.client) return fallbackStakeholders.filter((item) => item.company_id === companyId);
    try {
      const rows = await this.client.select('account_stakeholders', {
        select: '*',
        filters: [{ column: 'company_id', value: companyId }],
        orderBy: { column: 'updated_at', ascending: false },
      });
      return rows as Stakeholder[];
    } catch {
      return fallbackStakeholders.filter((item) => item.company_id === companyId);
    }
  }

  async create(companyId: string, payload: Partial<Stakeholder>) {
    const record = {
      company_id: companyId,
      name: payload.name,
      title: payload.title,
      email: payload.email,
      phone: payload.phone,
      linkedin_url: payload.linkedin_url,
      role_in_buying_committee: payload.role_in_buying_committee,
      seniority: payload.seniority,
      influence_score: payload.influence_score ?? 0,
      champion_score: payload.champion_score ?? 0,
      blocker_score: payload.blocker_score ?? 0,
      relationship_strength: payload.relationship_strength ?? 0,
      what_they_care_about: payload.what_they_care_about,
      known_objections: payload.known_objections,
      last_contact_at: payload.last_contact_at,
      notes: payload.notes,
    };

    if (!this.client) return { id: `stk_${Date.now()}`, ...record } as Stakeholder;
    const inserted = await this.client.insert('account_stakeholders', [record]);
    return inserted[0] as Stakeholder;
  }
}
