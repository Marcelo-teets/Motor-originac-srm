import { getSupabaseClient } from '../lib/supabase.js';
import type { PriorityResult } from './abmTypes.js';

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

export class CommercialPriorityService {
  private readonly client = getSupabaseClient();

  async compute(companyId: string): Promise<PriorityResult> {
    if (!this.client) {
      return {
        priority_score: 68,
        priority_band: 'high',
        rationale: 'Fallback: lead/ranking altos com boa tese e pequena fricção comercial.',
      };
    }

    const [lead, ranking, trigger, company, stakeholders, touchpoints, objections] = await Promise.all([
      this.client.select('lead_score_snapshots', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 1 }).catch(() => []),
      this.client.select('ranking_snapshots', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 1 }).catch(() => []),
      this.client.select('trigger_events', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 5 }).catch(() => []),
      this.client.select('companies', { select: 'id,estimated_ticket_size,next_step_due_at,priority_reason', filters: [{ column: 'id', value: companyId }], limit: 1 }).catch(() => []),
      this.client.select('account_stakeholders', { select: '*', filters: [{ column: 'company_id', value: companyId }] }).catch(() => []),
      this.client.select('touchpoints', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'occurred_at', ascending: false }, limit: 1 }).catch(() => []),
      this.client.select('objection_instances', { select: '*', filters: [{ column: 'company_id', value: companyId }, { column: 'status', value: 'open' }] }).catch(() => []),
    ]);

    const leadScore = Number(lead[0]?.lead_score ?? 50);
    const rankingScore = Number(ranking[0]?.ranking_score ?? leadScore);
    const triggerStrength = trigger.length ? Math.max(...trigger.map((item: any) => Number(item.trigger_strength ?? 0))) : 45;
    const estimatedTicket = Number(company[0]?.estimated_ticket_size ?? 0);
    const champions = stakeholders.filter((item: any) => Number(item.champion_score ?? 0) >= 60).length;
    const criticalObjections = objections.filter((item: any) => ['critical', 'high'].includes(String(item.severity ?? '').toLowerCase())).length;
    const staleTouchpoint = touchpoints[0]?.occurred_at ? ((Date.now() - new Date(touchpoints[0].occurred_at).getTime()) / 86400000) > 10 : true;
    const overdueNextStep = company[0]?.next_step_due_at ? new Date(company[0].next_step_due_at).getTime() < Date.now() : false;

    let score = 0;
    score += leadScore * 0.32;
    score += rankingScore * 0.25;
    score += triggerStrength * 0.18;
    score += Math.min(15, estimatedTicket / 2000000);
    score += champions > 0 ? 8 : -10;
    score += staleTouchpoint ? -10 : 6;
    score += overdueNextStep ? -8 : 5;
    score -= criticalObjections * 8;

    const priority_score = clamp(score);
    const priority_band: PriorityResult['priority_band'] = priority_score >= 80 ? 'immediate' : priority_score >= 65 ? 'high' : priority_score >= 45 ? 'medium' : 'monitor';
    const rationale = `Lead ${leadScore}, ranking ${rankingScore}, trigger ${triggerStrength}, champions ${champions}, objeções críticas ${criticalObjections}, staleTouchpoint ${staleTouchpoint}.`;

    await this.client.insert('commercial_priority_snapshots', [{ company_id: companyId, priority_score, priority_band, rationale }]).catch(() => undefined);
    await this.client.upsert('companies', [{ id: companyId, priority_reason: rationale }], 'id').catch(() => undefined);

    return { priority_score, priority_band, rationale };
  }
}
