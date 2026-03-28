export type PaperclipManagedAgent = {
  id: string;
  role: string;
  runtime: 'http' | 'codex' | 'claude' | 'cursor';
  heartbeatMinutes: number;
  approvalMode: 'manual' | 'automatic';
  endpoints: string[];
};

export const buildPaperclipAgentCatalog = (apiBaseUrl: string): PaperclipManagedAgent[] => [
  {
    id: 'ceo_orchestrator',
    role: 'CEO Orchestrator',
    runtime: 'http',
    heartbeatMinutes: 15,
    approvalMode: 'manual',
    endpoints: [`${apiBaseUrl}/paperclip/orchestrate/company/:id`, `${apiBaseUrl}/platform/status`],
  },
  {
    id: 'collection_motor',
    role: 'Collection Motor',
    runtime: 'http',
    heartbeatMinutes: 30,
    approvalMode: 'automatic',
    endpoints: [`${apiBaseUrl}/monitoring/run`, `${apiBaseUrl}/monitoring/run/company/:id`, `${apiBaseUrl}/monitoring/outputs`],
  },
  {
    id: 'enrichment_supervisor',
    role: 'Enrichment Supervisor',
    runtime: 'http',
    heartbeatMinutes: 30,
    approvalMode: 'automatic',
    endpoints: [`${apiBaseUrl}/companies/:id/signals`, `${apiBaseUrl}/companies/:id/monitoring`],
  },
  {
    id: 'qualification_agent',
    role: 'Qualification Agent',
    runtime: 'http',
    heartbeatMinutes: 30,
    approvalMode: 'automatic',
    endpoints: [`${apiBaseUrl}/companies/:id/qualification/recalculate`, `${apiBaseUrl}/score/company/:id/recalculate`, `${apiBaseUrl}/rankings/v2/recalculate`],
  },
  {
    id: 'pattern_analyst',
    role: 'Pattern Analyst',
    runtime: 'http',
    heartbeatMinutes: 60,
    approvalMode: 'automatic',
    endpoints: [`${apiBaseUrl}/companies/:id/patterns`, `${apiBaseUrl}/companies/:id/ranking`],
  },
  {
    id: 'commercial_board',
    role: 'Commercial Board',
    runtime: 'http',
    heartbeatMinutes: 120,
    approvalMode: 'manual',
    endpoints: [`${apiBaseUrl}/dashboard/summary`, `${apiBaseUrl}/pipeline`, `${apiBaseUrl}/activities`],
  },
];

export const buildPaperclipScaffoldStatus = (apiBaseUrl: string) => ({
  enabled: true,
  mode: 'scaffold',
  apiBaseUrl,
  sourceOfTruth: {
    backend: 'motor_backend',
    database: 'supabase',
    frontend: 'react_vite',
  },
  notes: [
    'Paperclip entra como camada de orquestracao.',
    'Backend, banco e frontend oficiais permanecem como fonte de verdade.',
    'Aprovacao humana continua obrigatoria para mudancas sensiveis.',
  ],
  agents: buildPaperclipAgentCatalog(apiBaseUrl),
});
