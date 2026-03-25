import { getSupabaseClient } from '../lib/supabase.js';
import type { Touchpoint } from './abmTypes.js';

const fallbackTouchpoints: Touchpoint[] = [
  {
    id: 'tp_seed_neon_1',
    company_id: 'cmp_neon_receivables',
    channel: 'meeting',
    direction: 'outbound',
    occurred_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    summary: 'Diagnóstico de funding gap com time financeiro.',
    sentiment: 'positive',
    objection_raised: true,
    agreed_next_step: 'Enviar proposta de trilha warehouse->FIDC',
    next_step_due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
  },
];

export class TouchpointService {
  private readonly client = getSupabaseClient();

  async listByCompany(companyId: string) {
    if (!this.client) return fallbackTouchpoints.filter((item) => item.company_id === companyId);
    try {
      const rows = await this.client.select('touchpoints', {
        select: '*',
        filters: [{ column: 'company_id', value: companyId }],
        orderBy: { column: 'occurred_at', ascending: false },
      });
      return rows as Touchpoint[];
    } catch {
      return fallbackTouchpoints.filter((item) => item.company_id === companyId);
    }
  }

  async create(companyId: string, payload: Partial<Touchpoint>) {
    const record = {
      company_id: companyId,
      stakeholder_id: payload.stakeholder_id ?? null,
      owner_name: payload.owner_name,
      channel: payload.channel,
      direction: payload.direction,
      occurred_at: payload.occurred_at ?? new Date().toISOString(),
      summary: payload.summary,
      raw_notes: payload.raw_notes,
      sentiment: payload.sentiment,
      objection_raised: Boolean(payload.objection_raised),
      agreed_next_step: payload.agreed_next_step,
      next_step_due_at: payload.next_step_due_at,
    };

    if (!this.client) return { id: `tp_${Date.now()}`, ...record } as Touchpoint;
    const inserted = await this.client.insert('touchpoints', [record]);
    return inserted[0] as Touchpoint;
  }
}
