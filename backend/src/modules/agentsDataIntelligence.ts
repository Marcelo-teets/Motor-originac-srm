import type { AgentDefinition } from './agents.js';

export const dataIntelligenceAgents: AgentDefinition[] = [
  {
    name: 'connector_runner_agent',
    objective: 'Executar endpoints do catálogo de fontes, respeitando parser, cadence, cache e tipo de extração.',
    inputs: ['connector_registry', 'source_endpoints', 'connector_payload_cache'],
    outputs: ['ingestion_runs', 'raw_documents'],
    writes: ['ingestion_runs', 'raw_documents', 'connector_payload_cache'],
    successCriteria: ['run registrado', 'payload capturado', 'documento bruto salvo'],
    fallback: 'Executar payload simulado controlado para preservar a esteira do motor.',
    status: 'partial'
  },
  {
    name: 'entity_resolution_agent',
    objective: 'Vincular documentos e fatos à empresa correta usando CNPJ, domínio, aliases e similaridade de nome.',
    inputs: ['companies', 'company_aliases', 'raw_documents'],
    outputs: ['company_source_links'],
    writes: ['company_source_links', 'company_aliases'],
    successCriteria: ['match com confidence', 'empresa vinculada'],
    fallback: 'Persistir match heurístico com confidence conservadora.',
    status: 'partial'
  },
  {
    name: 'fact_extraction_agent',
    objective: 'Extrair fatos estruturados a partir de documentos brutos e narrativas de mercado.',
    inputs: ['raw_documents', 'company_source_links'],
    outputs: ['company_source_facts'],
    writes: ['company_source_facts'],
    successCriteria: ['facts persistidos', 'fact_type e fact_key coerentes'],
    fallback: 'Persistir apenas facts de alta evidência.',
    status: 'partial'
  },
  {
    name: 'signal_extraction_agent',
    objective: 'Transformar documentos e facts em sinais operacionais com força, confiança e rationale.',
    inputs: ['raw_documents', 'company_source_facts', 'signal_rules'],
    outputs: ['signal_extractions'],
    writes: ['signal_extractions'],
    successCriteria: ['signal_type válido', 'strength definida', 'rationale salvo'],
    fallback: 'Aplicar regras canônicas do catálogo de sinais.',
    status: 'partial'
  },
  {
    name: 'enrichment_snapshot_agent',
    objective: 'Consolidar facts e sinais em snapshots de enrichment utilizáveis pelo motor principal.',
    inputs: ['company_source_facts', 'signal_extractions'],
    outputs: ['enrichment_snapshots'],
    writes: ['enrichment_snapshots'],
    successCriteria: ['snapshot coerente', 'payload consolidado'],
    fallback: 'Gerar snapshot mínimo com facts e sinais já persistidos.',
    status: 'partial'
  },
  {
    name: 'feedback_learning_agent',
    objective: 'Registrar feedbacks, memórias e aprendizados dos agentes para evolução contínua.',
    inputs: ['agent_feedback', 'agent_memory', 'agent_runs'],
    outputs: ['agent_memory', 'agent_improvement_backlog'],
    writes: ['agent_memory', 'agent_improvement_backlog'],
    successCriteria: ['aprendizado persistido', 'melhoria sugerida'],
    fallback: 'Gerar backlog de melhoria padrão para execuções com falha.',
    status: 'partial'
  },
  {
    name: 'continuous_improvement_backlog_agent',
    objective: 'Consolidar melhorias contínuas por agente, fonte, matching e enrichment.',
    inputs: ['agent_feedback', 'agent_memory', 'validation_results'],
    outputs: ['agent_improvement_backlog'],
    writes: ['agent_improvement_backlog'],
    successCriteria: ['ação criada', 'prioridade definida'],
    fallback: 'Registrar melhorias estáticas por categoria.',
    status: 'partial'
  }
];
