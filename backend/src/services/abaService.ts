import type { DashboardView } from '../types/platform.js';

export type AbaTarget = 'aba' | 'paper_clip' | 'adm';
export type AbaCommandStatus = 'queued' | 'running' | 'completed' | 'failed';

export type AbaCommandRecord = {
  id: string;
  target: AbaTarget;
  action: string;
  context: Record<string, unknown>;
  status: AbaCommandStatus;
  result: string;
  createdAt: string;
  finishedAt?: string;
};

export class AbaService {
  private commands: AbaCommandRecord[] = [];

  runCommand(target: AbaTarget, action: string, context: Record<string, unknown> = {}) {
    const now = new Date().toISOString();
    const record: AbaCommandRecord = {
      id: crypto.randomUUID(),
      target,
      action,
      context,
      status: 'completed',
      result: `Command '${action}' executado para ${target}.`,
      createdAt: now,
      finishedAt: now,
    };
    this.commands.unshift(record);
    return record;
  }

  buildAutoImprovements(dashboard: DashboardView) {
    const topLead = dashboard.topLeads[0];
    return [
      {
        id: 'aba_improvement_pipeline_hygiene',
        title: 'Reforçar hygiene de pipeline e next actions',
        reason: `Há ${dashboard.pipeline.reduce((sum, item) => sum + item.count, 0)} contas no pipeline; priorizar definição de próximas ações por estágio.`,
        owner: 'adm',
        priority: 'high',
      },
      {
        id: 'aba_improvement_top_lead_playbook',
        title: topLead ? `Rodar playbook comercial para ${topLead.companyName}` : 'Rodar playbook para top lead',
        reason: topLead ? `Lead score ${topLead.leadScore} e ranking ${topLead.rankingScore}.` : 'Sem top lead identificado no ranking atual.',
        owner: 'paper_clip',
        priority: 'high',
      },
      {
        id: 'aba_improvement_monitoring_feedback',
        title: 'Aplicar feedback loop de monitoring nas teses',
        reason: `Outputs 24h: ${dashboard.monitoring.outputs24h}; transformar sinais em tarefas de cobertura.`,
        owner: 'aba',
        priority: 'medium',
      },
    ];
  }

  getStatus(dashboard: DashboardView) {
    return {
      abaEnabled: true,
      capabilities: ['auto_improvement', 'build_agents', 'targeted_commands'],
      commandTargets: ['paper_clip', 'adm', 'aba'],
      lastCommands: this.commands.slice(0, 10),
      suggestedImprovements: this.buildAutoImprovements(dashboard),
    };
  }
}
