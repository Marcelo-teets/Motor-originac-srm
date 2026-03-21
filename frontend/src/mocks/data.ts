export const navItems = [
  ['/', 'Dashboard'],
  ['/search-profiles', 'Search Profiles'],
  ['/companies', 'Leads'],
  ['/monitoring', 'Monitoring Center'],
  ['/sources', 'Sources'],
  ['/agents', 'Agents Control'],
  ['/pipeline', 'Pipeline / Activities'],
];

export const dashboard = {
  summary: [
    { label: 'Empresas monitoradas', value: '3', helper: 'Seed inicial preparada para Supabase', tone: 'primary' },
    { label: 'Leads imediatos', value: '2', helper: 'Ranking V2 + patterns + trigger strength', tone: 'success' },
    { label: 'Padrões ativos', value: '10', helper: 'Catálogo canônico completo', tone: 'warning' },
    { label: 'Outputs 24h', value: '9', helper: 'BrasilAPI + RSS + website monitor', tone: 'info' },
  ],
  topLeads: [
    { company: 'Neon Receivables', score: 82, lead: 91, structure: 'FIDC + warehouse inicial', bucket: 'immediate_priority', trigger: 87 },
    { company: 'Orbit Pay', score: 74, lead: 79, structure: 'Debênture / nota comercial privada', bucket: 'high_priority', trigger: 72 },
    { company: 'Axon Health Credit', score: 67, lead: 70, structure: 'Debênture / nota comercial privada', bucket: 'high_priority', trigger: 67 },
  ],
  agents: [
    { name: 'qualification_agent', status: 'real', lastRun: '09:31 UTC', note: 'Snapshots + funding need + urgency' },
    { name: 'pattern_identification_agent', status: 'real', lastRun: '09:32 UTC', note: '10 padrões persistíveis em pattern_catalog/company_patterns' },
    { name: 'lead_score_agent', status: 'real', lastRun: '09:33 UTC', note: 'Ranking V2 com impacts dinâmicos' },
    { name: 'monitoring_agent', status: 'partial', lastRun: '09:30 UTC', note: 'RSS, website, BrasilAPI com fallback' },
  ],
  patterns: [
    { pattern: 'Growth without structured funding', companies: 2, avgImpact: 15 },
    { pattern: 'Capital mismatch for business model', companies: 2, avgImpact: 17 },
    { pattern: 'Momentum + timing + structural gap', companies: 2, avgImpact: 18 },
    { pattern: 'Strong receivables base with weak funding architecture', companies: 1, avgImpact: 15 },
  ],
  monitoring: {
    metrics: [
      { label: 'Fontes ativas', value: '4', helper: 'BrasilAPI, Google News RSS, website monitor, CVM RSS' },
      { label: 'Triggers/24h', value: '12', helper: 'Sinais consolidados por company + source' },
      { label: 'Website checks', value: '3', helper: 'Monitoramento básico do site da empresa' },
    ],
    highlights: ['BrasilAPI CNPJ com fallback controlado', 'RSS Google News básico por company', 'Website monitor para homepage/careers/blog'],
  },
  pipeline: [
    { stage: 'Identified', count: 3, coverage: 'base consolidada' },
    { stage: 'Qualified', count: 3, coverage: 'qualification_agent' },
    { stage: 'Approach', count: 2, coverage: 'lead_score >= 75' },
    { stage: 'Structuring', count: 1, coverage: 'tese FIDC pronta' },
  ],
  charts: {
    leadBuckets: [
      { label: 'Immediate', value: 2 },
      { label: 'High', value: 1 },
      { label: 'Monitor', value: 0 },
    ],
    qualificationVsLead: [
      { company: 'Neon Receivables', qualification: 82, lead: 91 },
      { company: 'Orbit Pay', qualification: 74, lead: 79 },
      { company: 'Axon Health Credit', qualification: 67, lead: 70 },
    ],
  },
};

export const companies = [
  {
    id: 'cmp_neon_receivables',
    name: 'Neon Receivables',
    segment: 'Fintech',
    subsegment: 'Crédito consignado B2B2C',
    structure: 'FIDC + warehouse inicial',
    qualification: 82,
    lead: 91,
    predictedFundingNeed: 84,
    urgency: 87,
    priority: 'immediate_priority',
    triggerStrength: 87,
    sourceConfidence: '0.82',
    patterns: ['Growth without structured funding', 'Strong receivables base with weak funding architecture', 'Momentum + timing + structural gap'],
  },
  {
    id: 'cmp_orbit_pay',
    name: 'Orbit Pay',
    segment: 'Embedded Finance',
    subsegment: 'Payments + crédito SMB',
    structure: 'Debênture / nota comercial privada',
    qualification: 74,
    lead: 79,
    predictedFundingNeed: 76,
    urgency: 72,
    priority: 'high_priority',
    triggerStrength: 72,
    sourceConfidence: '0.75',
    patterns: ['Embedded finance with implicit balance-sheet pressure', 'Capital mismatch for business model'],
  },
  {
    id: 'cmp_axon_health',
    name: 'Axon Health Credit',
    segment: 'Healthtech',
    subsegment: 'Parcelamento médico',
    structure: 'Debênture / nota comercial privada',
    qualification: 67,
    lead: 70,
    predictedFundingNeed: 69,
    urgency: 67,
    priority: 'high_priority',
    triggerStrength: 67,
    sourceConfidence: '0.71',
    patterns: ['Sophisticated credit narrative, immature funding stack', 'Operational maturity signals without capital market readiness yet'],
  },
];

export const companyDetail = {
  name: 'Neon Receivables',
  qualification: 82,
  lead: 91,
  rankingScore: 88,
  predictedFundingNeed: 84,
  urgency: 87,
  suggestedStructure: 'FIDC + warehouse inicial',
  currentFundingStructure: 'Balanço próprio + linhas bilaterais',
  headerMeta: [
    { label: 'Segmento', value: 'Fintech / Crédito consignado B2B2C' },
    { label: 'Website', value: 'neonreceivables.com.br' },
    { label: 'Stage', value: 'Series B+' },
    { label: 'CNPJ', value: '27.865.757/0001-02' },
  ],
  qualificationBlocks: [
    ['Produto de crédito', 'Crédito core com originação recorrente e dependência crescente de funding escalável.'],
    ['Recebíveis', 'Base previsível de cartão e folha com sinais fortes de elegibilidade para FIDC.'],
    ['Estrutura atual', 'Funding stack ainda concentrado em balanço próprio e linhas bilaterais.'],
    ['Timing', 'Expansão comercial, contratações em capital markets e aumento de volume criam janela clara.'],
  ],
  patterns: [
    { title: 'Growth without structured funding', confidence: '0.82', impact: '+15 ranking/lead', rationale: 'Crescimento comercial acima da infraestrutura atual de funding.' },
    { title: 'Strong receivables base with weak funding architecture', confidence: '0.84', impact: '+15 thesis', rationale: 'Recebíveis recorrentes com stack de capital ainda frágil.' },
    { title: 'Momentum + timing + structural gap', confidence: '0.86', impact: '+18 prioridade', rationale: 'Janela comercial evidente para originação estruturada.' },
  ],
  scoreHistory: [
    { at: '2026-02-21', qualification: 75, lead: 82 },
    { at: '2026-03-07', qualification: 79, lead: 87 },
    { at: '2026-03-21', qualification: 82, lead: 91 },
  ],
  prediction: [
    { label: 'Predicted funding need', value: '84', detail: 'A pressão de funding já afeta a velocidade comercial.' },
    { label: 'Urgency score', value: '87', detail: 'Timing alto por expansão + hires + sinais públicos.' },
    { label: 'Source confidence', value: '0.82', detail: 'Convergência entre website, CNPJ e RSS.' },
  ],
  signals: [
    'Contratações em risco, cobrança e capital markets',
    'Expansão para novo canal de distribuição',
    'Narrativa explícita de funding escalável e eficiência de capital',
  ],
  monitoring: {
    summary: ['Última execução: 09:30 UTC', '5 triggers úteis', '3 conectores ativos na empresa'],
    outputs: [
      { title: 'Website monitor', text: 'Nova vaga de capital markets e atualização da homepage para originadores.' },
      { title: 'RSS', text: 'Cobertura sobre expansão de canal e crescimento da operação.' },
      { title: 'BrasilAPI CNPJ', text: 'Cadastro base disponível para entity resolution e source governance.' },
    ],
  },
  thesis: 'Estruturar FIDC com warehouse inicial para retirar pressão do balanço próprio, ampliar a capacidade de funding e criar trilha de mercado de capitais mais robusta.',
  marketMap: [
    { name: 'Receivables Alpha', type: 'FIDC-backed lender', rationale: 'Benchmark de funding lastreado em recebíveis elegíveis.' },
    { name: 'Embedded Credit Beta', type: 'Warehouse + FIDC path', rationale: 'Comparável de transição gradual para FIDC.' },
    { name: 'Payroll Gamma', type: 'Private debt issuer', rationale: 'Alternativa tática de estruturação privada.' },
  ],
  activities: [
    { title: 'Preparar tese executiva FIDC', owner: 'Origination', status: 'open' },
    { title: 'Agendar call com CFO', owner: 'Coverage', status: 'planned' },
    { title: 'Validar documentação de risco e governança', owner: 'Analytics', status: 'next_action' },
  ],
  sources: [
    { name: 'BrasilAPI CNPJ', status: 'real', note: 'Integração inicial real.' },
    { name: 'Google News RSS', status: 'real', note: 'Feed básico por companhia.' },
    { name: 'Website monitor', status: 'partial', note: 'Captura básica de título/headings.' },
    { name: 'LinkedIn Hiring Signals', status: 'mock', note: 'Mantido como fallback planejado.' },
  ],
};

export const searchProfileFields = [
  'segmento',
  'subsetor',
  'tipo de empresa',
  'geografia',
  'produto de crédito',
  'recebíveis',
  'estrutura alvo',
  'intensidade mínima de sinais',
  'confidence mínima',
  'janela temporal',
];

export const sources = [
  { name: 'BrasilAPI CNPJ', type: 'api', status: 'real', category: 'Cadastral', health: 'healthy' },
  { name: 'Google News RSS', type: 'rss', status: 'real', category: 'News/RSS', health: 'healthy' },
  { name: 'Company Website Monitor', type: 'sitemap', status: 'partial', category: 'Website monitoring', health: 'healthy' },
  { name: 'CVM RSS', type: 'rss', status: 'partial', category: 'Regulatório', health: 'healthy' },
  { name: 'LinkedIn Hiring Signals', type: 'scraper', status: 'mock', category: 'Digital signals', health: 'degraded' },
];

export const stackStatus = [
  { label: 'Real', value: 'qualification agent, pattern catalog, ranking v2, BrasilAPI/RSS base, DDL/migrations' },
  { label: 'Parcial', value: 'monitoring contínuo, CVM RSS, pipeline mutável, website monitor avançado' },
  { label: 'Hardcoded', value: 'pesos, thresholds, seeds iniciais e racionales base' },
  { label: 'Mockado', value: 'auth demo, LinkedIn, parte do fallback de frontend' },
];
