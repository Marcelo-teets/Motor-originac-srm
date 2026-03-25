import { getSupabaseClient } from '../lib/supabase.js';
import type { ObjectionInstance } from './abmTypes.js';

const fallbackObjections: ObjectionInstance[] = [
  {
    id: 'obj_seed_neon_1',
    company_id: 'cmp_neon_receivables',
    objection_text: 'Timing para iniciar estrutura dedicada no trimestre corrente.',
    status: 'open',
    severity: 'high',
    resolution_notes: 'Preparar pre-mortem com custo de inação.',
  },
];

export class ObjectionIntelligenceService {
  private readonly client = getSupabaseClient();

  async listByCompany(companyId: string) {
    if (!this.client) return fallbackObjections.filter((item) => item.company_id === companyId);
    try {
      const rows = await this.client.select('objection_instances', {
        select: '*',
        filters: [{ column: 'company_id', value: companyId }],
        orderBy: { column: 'updated_at', ascending: false },
      });
      return rows as ObjectionInstance[];
    } catch {
      return fallbackObjections.filter((item) => item.company_id === companyId);
    }
  }

  async create(companyId: string, payload: Partial<ObjectionInstance>) {
    const record = {
      company_id: companyId,
      stakeholder_id: payload.stakeholder_id ?? null,
      touchpoint_id: payload.touchpoint_id ?? null,
      playbook_id: payload.playbook_id ?? null,
      objection_text: payload.objection_text,
      status: payload.status ?? 'open',
      severity: payload.severity,
      resolution_notes: payload.resolution_notes,
    };

    if (!this.client) return { id: `obj_${Date.now()}`, ...record } as ObjectionInstance;
    const inserted = await this.client.insert('objection_instances', [record]);
    return inserted[0] as ObjectionInstance;
  }
}
