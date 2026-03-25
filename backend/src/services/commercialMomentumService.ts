import { getSupabaseClient } from '../lib/supabase.js';
import type { MomentumResult } from './abmTypes.js';

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

export class CommercialMomentumService {
  private readonly client = getSupabaseClient();

  async compute(companyId: string): Promise<MomentumResult> {
    if (!this.client) {
      return {
        momentum_score: 62,
        momentum_status: 'stable',
        rationale: 'Fallback: touchpoint recente com uma objeção aberta e champion ativo.',
      };
    }

    const [touchpoints, stakeholders, objections, leadScore, signals] = await Promise.all([
      this.client.select('touchpoints', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'occurred_at', ascending: false }, limit: 5 }).catch(() => []),
      this.client.select('account_stakeholders', { select: '*', filters: [{ column: 'company_id', value: companyId }] }).catch(() => []),
      this.client.select('objection_instances', { select: '*', filters: [{ column: 'company_id', value: companyId }, { column: 'status', value: 'open' }] }).catch(() => []),
      this.client.select('lead_score_snapshots', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 2 }).catch(() => []),
      this.client.select('company_signals', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 5 }).catch(() => []),
    ]);

    const now = Date.now();
    const lastTouchpointAt = touchpoints[0]?.occurred_at ? new Date(touchpoints[0].occurred_at).getTime() : 0;
    const touchpointDays = lastTouchpointAt ? (now - lastTouchpointAt) / 86400000 : 99;
    const overdue = touchpoints.some((item: any) => item.next_step_due_at && new Date(item.next_step_due_at).getTime() < now);
    const champions = stakeholders.filter((item: any) => Number(item.champion_score ?? 0) >= 60).length;
    const blockers = stakeholders.filter((item: any) => Number(item.blocker_score ?? 0) >= 50).length;
    const openObjections = objections.length;
    const leadDelta = leadScore.length >= 2 ? Number(leadScore[0].lead_score ?? 0) - Number(leadScore[1].lead_score ?? 0) : 0;
    const avgSignal = signals.length ? signals.reduce((sum: number, item: any) => sum + Number(item.signal_strength ?? 0), 0) / signals.length : 0;

    let score = 55;
    score += touchpointDays <= 3 ? 16 : touchpointDays <= 7 ? 8 : -12;
    score += overdue ? -12 : 6;
    score += champions * 5;
    score -= blockers * 6;
    score -= openObjections * 4;
    score += Math.max(-8, Math.min(10, leadDelta));
    score += Math.round(avgSignal / 15);

    const momentum_score = clamp(score);
    const momentum_status: MomentumResult['momentum_status'] = momentum_score >= 70 ? 'accelerating' : momentum_score >= 45 ? 'stable' : 'cooling';
    const rationale = `Touchpoint há ${Math.round(touchpointDays)}d; champions ${champions}; blockers ${blockers}; objeções abertas ${openObjections}; lead delta ${leadDelta}.`;

    await this.client.insert('account_momentum_snapshots', [{ company_id: companyId, momentum_score, momentum_status, rationale }]).catch(() => undefined);
    await this.client.upsert('companies', [{ id: companyId, momentum_status }], 'id').catch(() => undefined);

    return { momentum_score, momentum_status, rationale };
  }
}
