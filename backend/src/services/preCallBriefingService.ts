import { getSupabaseClient } from '../lib/supabase.js';
import { AccountStakeholderService } from './accountStakeholderService.js';
import { ObjectionIntelligenceService } from './objectionIntelligenceService.js';
import { TouchpointService } from './touchpointService.js';

export class PreCallBriefingService {
  private readonly client = getSupabaseClient();
  private readonly stakeholders = new AccountStakeholderService();
  private readonly touchpoints = new TouchpointService();
  private readonly objections = new ObjectionIntelligenceService();

  async build(companyId: string) {
    const [companyRows, decisionMemo, qualification, intelligenceSignals, stakeholders, touchpoints, objections] = await Promise.all([
      this.client?.select('companies', { select: '*', filters: [{ column: 'id', value: companyId }], limit: 1 }).catch(() => []) ?? [],
      this.client?.select('thesis_outputs', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 1 }).catch(() => []) ?? [],
      this.client?.select('qualification_snapshots', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 1 }).catch(() => []) ?? [],
      this.client?.select('company_signals', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 5 }).catch(() => []) ?? [],
      this.stakeholders.listByCompany(companyId),
      this.touchpoints.listByCompany(companyId),
      this.objections.listByCompany(companyId),
    ]);

    const company = companyRows[0] ?? { id: companyId, legal_name: companyId, observed_payload: {} };
    const openObjections = objections.filter((item) => item.status === 'open');

    return {
      companyId,
      institutional_summary: company.observed_payload?.description ?? `${company.legal_name} em monitoramento comercial`,
      thesis: decisionMemo[0]?.thesis_summary ?? 'Tese em consolidação com sinais de funding need',
      why_now: intelligenceSignals[0]?.evidence_payload?.note ?? touchpoints[0]?.summary ?? 'Sinais recentes indicam janela comercial ativa.',
      recent_signals: intelligenceSignals.map((item: any) => ({
        type: item.signal_type,
        strength: item.signal_strength,
        observed_at: item.created_at,
      })),
      stakeholders,
      recent_touchpoints: touchpoints.slice(0, 6),
      open_objections: openObjections,
      recommended_next_step: company.next_step ?? touchpoints[0]?.agreed_next_step ?? 'Agendar call executiva com champion e CFO.',
      conversation_risks: openObjections.slice(0, 3).map((item) => item.objection_text),
      suggested_cta: `Fechar ${qualification[0]?.suggested_structure_type ?? 'plano de estrutura'} com cronograma de execução em 14 dias.`,
    };
  }

  async buildPreMortem(companyId: string) {
    const briefing = await this.build(companyId);
    const risks = [
      {
        risk: 'Deal esfriar por falta de próximo passo claro',
        evidence: briefing.recent_touchpoints.length ? 'Existem touchpoints, mas nem todos com due date protegido.' : 'Nenhum touchpoint recente encontrado.',
        mitigation: 'Definir next step com responsável e data em até 48h.',
      },
      {
        risk: 'Objeções de timing bloquearem avanço',
        evidence: briefing.open_objections.map((item: any) => item.objection_text).join(' | ') || 'Nenhuma objeção aberta registrada.',
        mitigation: 'Usar playbook por severidade e validar champion sponsor na próxima call.',
      },
      {
        risk: 'Narrativa sem conexão com funding structure',
        evidence: briefing.thesis,
        mitigation: 'Converter tese em plano executivo de 3 marcos: readiness, estrutura, execução.',
      },
    ];

    return { companyId, risks };
  }

  async weeklyWarRoom() {
    if (!this.client) {
      return {
        top_accounts: [{ company_id: 'cmp_neon_receivables', company_name: 'Neon Receivables', priority_band: 'high', momentum_status: 'stable' }],
        cooling_accounts: [],
        without_champion: [],
        overdue_next_steps: [],
        critical_open_objections: [],
      };
    }

    const [companies, priorities, momentum, objections, stakeholders] = await Promise.all([
      this.client.select('companies', { select: 'id,legal_name,next_step_due_at' }).catch(() => []),
      this.client.select('commercial_priority_snapshots', { select: '*', orderBy: { column: 'created_at', ascending: false }, limit: 100 }).catch(() => []),
      this.client.select('account_momentum_snapshots', { select: '*', orderBy: { column: 'created_at', ascending: false }, limit: 100 }).catch(() => []),
      this.client.select('objection_instances', { select: '*', filters: [{ column: 'status', value: 'open' }] }).catch(() => []),
      this.client.select('account_stakeholders', { select: '*' }).catch(() => []),
    ]);

    const latestPriority = new Map<string, any>();
    priorities.forEach((item: any) => { if (!latestPriority.has(item.company_id)) latestPriority.set(item.company_id, item); });
    const latestMomentum = new Map<string, any>();
    momentum.forEach((item: any) => { if (!latestMomentum.has(item.company_id)) latestMomentum.set(item.company_id, item); });

    const championByCompany = stakeholders.reduce((acc: Map<string, number>, item: any) => {
      const current = acc.get(item.company_id) ?? 0;
      acc.set(item.company_id, Math.max(current, Number(item.champion_score ?? 0)));
      return acc;
    }, new Map<string, number>());

    return {
      top_accounts: companies
        .map((company: any) => ({
          company_id: company.id,
          company_name: company.legal_name,
          priority_band: latestPriority.get(company.id)?.priority_band ?? 'monitor',
          priority_score: latestPriority.get(company.id)?.priority_score ?? 0,
          momentum_status: latestMomentum.get(company.id)?.momentum_status ?? 'stable',
          momentum_score: latestMomentum.get(company.id)?.momentum_score ?? 0,
        }))
        .sort((a: any, b: any) => b.priority_score - a.priority_score)
        .slice(0, 8),
      cooling_accounts: companies
        .filter((company: any) => (latestMomentum.get(company.id)?.momentum_status ?? '') === 'cooling')
        .map((company: any) => ({ company_id: company.id, company_name: company.legal_name })),
      without_champion: companies
        .filter((company: any) => (championByCompany.get(company.id) ?? 0) < 60)
        .map((company: any) => ({ company_id: company.id, company_name: company.legal_name })),
      overdue_next_steps: companies
        .filter((company: any) => company.next_step_due_at && new Date(company.next_step_due_at).getTime() < Date.now())
        .map((company: any) => ({ company_id: company.id, company_name: company.legal_name, next_step_due_at: company.next_step_due_at })),
      critical_open_objections: objections
        .filter((item: any) => ['critical', 'high'].includes(String(item.severity ?? '').toLowerCase()))
        .map((item: any) => ({ company_id: item.company_id, objection_text: item.objection_text, severity: item.severity })),
    };
  }
}
