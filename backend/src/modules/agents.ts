export type AgentDefinition = {
  name: string;
  objective: string;
  inputs: string[];
  outputs: string[];
  writes: string[];
  successCriteria: string[];
  fallback: string;
  status: 'real' | 'partial' | 'mock';
};

export const agentDefinitions: AgentDefinition[] = [
  {
    name: 'data_scraper_agent',
    objective: 'Coletar sinais em APIs, feeds, sitemap e website monitoring com fallback rastreável.',
    inputs: ['source_catalog', 'monitoring_state'],
    outputs: ['monitoring_outputs', 'company_signals'],
    writes: ['monitoring_outputs', 'trigger_events'],
    successCriteria: ['fonte consultada', 'payload normalizado', 'rastreabilidade registrada'],
    fallback: 'Usar outputs centralizados em mocks/config quando a fonte real falhar.',
    status: 'partial'
  },
  {
    name: 'data_mining_agent',
    objective: 'Consolidar múltiplas fontes em sinais deduplicados e confiáveis.',
    inputs: ['monitoring_outputs', 'company_sources'],
    outputs: ['company_signals', 'enrichments'],
    writes: ['company_signals'],
    successCriteria: ['sinais deduplicados', 'confidence calculada'],
    fallback: 'Manter apenas sinais explícitos e catalogados.',
    status: 'partial'
  },
  { name: 'data_enrichment_agent', objective: 'Enriquecer cadastro, governança e contexto setorial.', inputs: ['companies'], outputs: ['enrichments'], writes: ['enrichments'], successCriteria: ['payload enriquecido'], fallback: 'Retornar perfil base seeded', status: 'partial' },
  { name: 'data_processing_agent', objective: 'Processar normalização, entity resolution e governança de fontes.', inputs: ['monitoring_outputs'], outputs: ['companies', 'company_sources'], writes: ['companies', 'company_sources'], successCriteria: ['shape válido', 'entity resolution'], fallback: 'Persistir bruto com source trace', status: 'partial' },
  { name: 'audit_and_data_check_agent', objective: 'Avaliar qualidade dos dados, blockers e source governance.', inputs: ['companies', 'company_signals'], outputs: ['validation_results'], writes: ['validation_results'], successCriteria: ['regras auditadas'], fallback: 'score conservador', status: 'partial' },
  { name: 'orchestration_agent', objective: 'Orquestrar execução dos agentes por companhia mantendo a arquitetura oficial atual.', inputs: ['agent_definitions', 'companies'], outputs: ['agent_runs', 'agent_run_steps'], writes: ['agent_runs', 'agent_run_steps'], successCriteria: ['etapas ordenadas'], fallback: 'pipeline estático', status: 'real' },
  { name: 'monitoring_agent', objective: 'Executar monitoring service para RSS, website e CNPJ base.', inputs: ['source_catalog', 'watchlists'], outputs: ['monitoring_state', 'monitoring_outputs'], writes: ['monitoring_state', 'monitoring_outputs'], successCriteria: ['execução registrada'], fallback: 'janela diária mockada', status: 'partial' },
  { name: 'learning_agent', objective: 'Registrar aprendizados e feedback loops.', inputs: ['validation_results', 'score_history'], outputs: ['learning_memory'], writes: ['learning_memory'], successCriteria: ['aprendizado registrado'], fallback: 'registrar insight manual', status: 'mock' },
  { name: 'continuous_improvement_agent', objective: 'Gerar backlog de melhoria contínua.', inputs: ['learning_memory'], outputs: ['improvement_backlog'], writes: ['improvement_backlog'], successCriteria: ['ação priorizada'], fallback: 'template estático', status: 'mock' },
  { name: 'pattern_identification_agent', objective: 'Detectar 10 padrões canônicos de funding mismatch persistindo pattern_catalog e company_patterns.', inputs: ['companies', 'company_signals', 'qualification_snapshots', 'monitoring_outputs'], outputs: ['company_patterns'], writes: ['company_patterns'], successCriteria: ['família de padrão', 'impacto em qualification/lead/ranking'], fallback: 'catálogo canônico seeded', status: 'real' },
  { name: 'lead_score_agent', objective: 'Calcular lead score e bucket comercial com lógica RankingV2Service.', inputs: ['qualification_snapshots', 'company_patterns', 'validation_results'], outputs: ['lead_score_snapshots'], writes: ['lead_score_snapshots', 'ranking_v2'], successCriteria: ['score 0-100', 'next action'], fallback: 'peso fixo hardcoded', status: 'real' },
  { name: 'qualification_agent', objective: 'Gerar qualification_snapshots, predicted_funding_need, urgency, rationale e evidence_payload reais em cima do schema atual.', inputs: ['companies', 'company_signals', 'monitoring_outputs', 'enrichments', 'company_patterns'], outputs: ['qualification_snapshots', 'thesis_outputs'], writes: ['qualification_snapshots', 'score_snapshots', 'thesis_outputs'], successCriteria: ['score estrutural', 'evidence payload', 'suggested structure'], fallback: 'heurística conservadora baseada em recebíveis e funding gap', status: 'real' }
];

export const topPatterns = [
  'Growth without structured funding',
  'Credit product without dedicated capital structure',
  'Strong receivables base with weak funding architecture',
  'Expansion outpacing capital structure',
  'Embedded finance with implicit balance-sheet pressure',
  'Sophisticated credit narrative, immature funding stack',
  'Operational maturity signals without capital market readiness yet',
  'Funding dependence hidden in commercial narrative',
  'Capital mismatch for business model',
  'Momentum + timing + structural gap'
];
