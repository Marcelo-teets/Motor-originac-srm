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
    { label: 'Empresas monitoradas', value: '148', tone: 'primary' },
    { label: 'Novos leads', value: '19', tone: 'success' },
    { label: 'Padrões detectados', value: '27', tone: 'warning' },
    { label: 'Pipeline potencial', value: 'R$ 480 mi', tone: 'primary' },
  ],
  topLeads: [
    { company: 'Neon Receivables', score: 88, lead: 84, structure: 'FIDC' },
    { company: 'Orbit Pay', score: 76, lead: 71, structure: 'Nota comercial' },
    { company: 'Axon Health Credit', score: 69, lead: 66, structure: 'Debênture' },
  ],
  agents: [
    { name: 'qualification_agent', status: 'healthy', lastRun: '09:01 UTC' },
    { name: 'pattern_identification_agent', status: 'healthy', lastRun: '09:03 UTC' },
    { name: 'monitoring_agent', status: 'degraded', lastRun: '08:55 UTC' },
  ],
  patterns: ['Growth without structured funding', 'Capital mismatch for business model', 'Momentum + timing + structural gap'],
  pipeline: [
    { stage: 'Identified', count: 32 },
    { stage: 'Qualified', count: 17 },
    { stage: 'Approach', count: 9 },
    { stage: 'Structuring', count: 4 },
  ],
  monitoring: ['132 outputs/24h', '17 triggers/24h', '4 fontes ativas'],
};

export const companies = [
  { id: 'cmp_neon_receivables', name: 'Neon Receivables', segment: 'Fintech', structure: 'FIDC', qualification: 88, lead: 84, priority: 'immediate_priority' },
  { id: 'cmp_orbit_pay', name: 'Orbit Pay', segment: 'Embedded Finance', structure: 'Nota comercial', qualification: 76, lead: 71, priority: 'high_priority' },
  { id: 'cmp_axon_health', name: 'Axon Health Credit', segment: 'Healthtech', structure: 'Debênture', qualification: 69, lead: 66, priority: 'monitor_closely' },
];

export const companyDetail = {
  name: 'Neon Receivables',
  qualification: 88,
  lead: 84,
  predictedFundingNeed: 82,
  suggestedStructure: 'FIDC + warehouse inicial',
  qualificationBlocks: [
    ['Produto de crédito', 'Crédito core com originação recorrente e necessidade de funding escalável.'],
    ['Recebíveis', 'Base previsível de cartão e folha com elegibilidade aparente.'],
    ['Estrutura', 'Arquitetura atual ainda pressionando balanço e limitando crescimento.'],
    ['Timing', 'Expansão comercial recente, contratação de risco e aumento de volume.'],
  ],
  patterns: [
    { title: 'Growth without structured funding', confidence: '0.86', impact: '+8 qualificação' },
    { title: 'Strong receivables base with weak funding architecture', confidence: '0.82', impact: '+9 tese FIDC' },
    { title: 'Momentum + timing + structural gap', confidence: '0.79', impact: '+7 lead score' },
  ],
  signals: ['Contratações em risco e cobrança', 'Expansão para novo canal de distribuição', 'Narrativa explícita de crédito e embedded finance'],
  thesis: 'Estruturar FIDC com segregação de risco e capacidade de funding para acompanhar o crescimento.',
  marketMap: ['Fintech A / FIDC multi-cedente', 'Embedded lender B / warehouse', 'Receivables player C / debênture privada'],
  monitoring: ['Última execução: 09:30 UTC', '5 triggers ativos', '18 outputs úteis na janela'],
  activities: ['Preparar tese executiva', 'Agendar call com CFO', 'Validar documentos de risco'],
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
  { name: 'Google News RSS', type: 'rss', status: 'real', category: 'News/RSS', health: 'healthy' },
  { name: 'CVM RSS', type: 'rss', status: 'partial', category: 'Regulatório', health: 'healthy' },
  { name: 'LinkedIn Hiring Signals', type: 'scraper', status: 'mock', category: 'Digital signals', health: 'degraded' },
];

export const stackStatus = [
  { label: 'Real', value: 'dashboard, companies, qualification, lead score' },
  { label: 'Parcial', value: 'monitoring, pipeline, conectores prioritários' },
  { label: 'Hardcoded', value: 'pesos, buckets, catálogos e racionales iniciais' },
  { label: 'Mockado', value: 'auth demo, fallback de dados de frontend e alguns conectores' },
];
