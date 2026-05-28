export const ORIGINATION_OPERATING_SYSTEM_VERSION = '2026.05.28';

export type OriginationPriority = 'A' | 'B' | 'C' | 'Reciclar';
export type OriginationProduct = 'FIDC' | 'CRI' | 'CRA' | 'Debenture' | 'Debenture Incentivada';
export type ImplementationStatus = 'implemented' | 'runtime_ready' | 'documented';

export const originationProducts: Array<{
  product: OriginationProduct;
  useCase: string;
  idealCompanyProfile: string[];
  qualificationSignals: string[];
}> = [
  {
    product: 'FIDC',
    useCase: 'Recebíveis recorrentes, carteira pulverizada, antecipação, crédito embarcado e capital de giro estruturado.',
    idealCompanyProfile: ['Fintechs', 'SaaS com carteira recorrente', 'marketplaces', 'plataformas B2B', 'empresas com recebíveis performados ou pulverizados'],
    qualificationSignals: ['recebíveis recorrentes', 'produto de crédito', 'volume transacional', 'necessidade de funding não dilutivo', 'crescimento de carteira'],
  },
  {
    product: 'CRI',
    useCase: 'Recebíveis imobiliários, contratos imobiliários, loteamento, incorporação ou plataformas com fluxo imobiliário.',
    idealCompanyProfile: ['Proptechs', 'incorporadoras', 'loteadoras', 'plataformas imobiliárias'],
    qualificationSignals: ['recebíveis imobiliários', 'contratos de compra e venda', 'fluxo de parcelas', 'estoque imobiliário', 'necessidade de funding para obra ou aquisição'],
  },
  {
    product: 'CRA',
    useCase: 'Recebíveis do agronegócio, CPR, insumos, cadeia agro e contratos comerciais ligados ao agro.',
    idealCompanyProfile: ['Agtechs', 'tradings', 'cooperativas', 'distribuidores de insumos', 'empresas da cadeia agro'],
    qualificationSignals: ['recebíveis agro', 'safra', 'CPR', 'contratos com produtores', 'capital de giro sazonal'],
  },
  {
    product: 'Debenture',
    useCase: 'Dívida corporativa estruturada para empresas com porte, governança e necessidade de capital recorrente.',
    idealCompanyProfile: ['Middle market', 'scale-ups maduras', 'empresas tech-based', 'companhias com plano de expansão'],
    qualificationSignals: ['ticket potencial acima de R$ 20MM', 'governança mínima', 'funding de expansão', 'estrutura corporativa clara'],
  },
  {
    product: 'Debenture Incentivada',
    useCase: 'Projetos elegíveis de infraestrutura com benefício fiscal, especialmente energia, saneamento, logística, telecom e infraestrutura digital.',
    idealCompanyProfile: ['Energia', 'saneamento', 'logística', 'telecom', 'infraestrutura digital'],
    qualificationSignals: ['capex elegível', 'projeto de infraestrutura', 'receita contratada', 'autorização/regulação setorial', 'investidores PF/institucionais'],
  },
];

export const srmStructures = [
  { name: 'SRM Ventures', role: 'Originação, relacionamento com startups, tese comercial e aproximação com fundadores/CFOs.' },
  { name: 'SRM Empírica', role: 'Gestão, estruturação, fundos, leitura técnica e institucional.' },
  { name: 'SRM Asset', role: 'Gestão de veículos e estruturação de produtos de crédito.' },
  { name: 'DCM SRM', role: 'Originação, estruturação, distribuição, mandato e execução.' },
];

export const originationSkillTree = [
  {
    id: 'skill_research',
    name: 'Research Skills',
    objective: 'Coletar, organizar e interpretar informações públicas, comerciais e estratégicas sobre empresas, setores e sinais de funding.',
    inputs: ['nome da empresa', 'site', 'LinkedIn', 'CNPJ', 'setor', 'notícias', 'rodadas', 'produtos', 'sinais de recebíveis/crédito/funding'],
    outputs: ['resumo da empresa', 'modelo de negócio', 'sinais de funding', 'produto SRM sugerido', 'riscos', 'fontes', 'grau de confiança'],
    tasks: ['mapear modelo de negócio', 'separar fatos de hipóteses', 'capturar sinais de expansão/funding', 'classificar produto DCM aplicável'],
  },
  {
    id: 'skill_lead_generator',
    name: 'Lead Generator',
    objective: 'Gerar listas de empresas com potencial de originação DCM e priorizar por aderência comercial.',
    inputs: ['vertical', 'produto', 'tamanho mínimo', 'região', 'tipo de empresa', 'sinais esperados'],
    outputs: ['lista de leads', 'prioridade A/B/C/Reciclar', 'produto sugerido', 'próxima ação'],
    tasks: ['mapear empresas', 'filtrar ICP', 'remover nomes fora da tese', 'criar ranking mínimo por categoria'],
  },
  {
    id: 'skill_icp_decoder',
    name: 'ICP Decoder',
    objective: 'Traduzir o perfil ideal de cliente em critérios objetivos de qualificação.',
    inputs: ['segmento', 'porte', 'recebíveis', 'modelo de receita', 'funding atual', 'governança'],
    outputs: ['fit com ICP', 'sinais positivos', 'sinais negativos', 'nível de prioridade'],
    tasks: ['avaliar porte', 'avaliar recorrência', 'avaliar funding gap', 'avaliar maturidade para DCM'],
  },
  {
    id: 'skill_profile_architect',
    name: 'Profile Architect',
    objective: 'Construir o perfil comercial da empresa para apoiar abordagem e tese.',
    inputs: ['dados cadastrais', 'site', 'LinkedIn', 'modelo de negócio', 'contatos', 'sinais financeiros'],
    outputs: ['perfil comercial', 'dor provável', 'produto indicado', 'contato-alvo', 'próximo passo'],
    tasks: ['resumir negócio', 'mapear receita', 'identificar recebíveis', 'definir ângulo comercial'],
  },
  {
    id: 'skill_hook_engineer',
    name: 'Hook Engineer',
    objective: 'Criar ganchos comerciais personalizados para fundadores, CFOs e executivos.',
    inputs: ['empresa', 'dor provável', 'produto SRM', 'cargo do contato', 'trigger recente'],
    outputs: ['hook consultivo', 'mensagem LinkedIn', 'e-mail inicial', 'follow-up'],
    tasks: ['escolher ângulo', 'evitar venda genérica', 'conectar sinal com produto', 'gerar variações de abordagem'],
  },
  {
    id: 'skill_deck_composer',
    name: 'Carousel / Deck Composer',
    objective: 'Gerar materiais comerciais, one-pagers, apresentações e narrativas visuais.',
    inputs: ['tese', 'empresa', 'produto', 'racional', 'dados-chave'],
    outputs: ['one-pager', 'mini deck', 'memo interno', 'carrossel', 'IC memo preliminar'],
    tasks: ['organizar tese', 'transformar análise em narrativa', 'criar material de apoio', 'preparar versão executiva'],
  },
  {
    id: 'skill_sequencer',
    name: 'DM / Email Sequencer',
    objective: 'Criar sequências de abordagem por LinkedIn, e-mail, WhatsApp e follow-up.',
    inputs: ['contato', 'canal', 'empresa', 'produto', 'tese', 'status no pipeline'],
    outputs: ['mensagem inicial', 'follow-up', 'e-mail consultivo', 'reativação'],
    tasks: ['gerar sequência', 'controlar tom', 'adaptar por persona', 'registrar próxima ação'],
  },
  {
    id: 'skill_lead_scorer',
    name: 'Lead Scorer',
    objective: 'Classificar leads com base em critérios comerciais, financeiros e estratégicos.',
    inputs: ['fit produto', 'recebíveis', 'funding signal', 'porte', 'backing VC/PE', 'probabilidade de conversa', 'trigger'],
    outputs: ['score 0-100', 'bucket', 'rationale', 'próxima ação'],
    tasks: ['aplicar scorecard', 'priorizar', 'gerar justificativa', 'alimentar ranking'],
  },
] as const;

export const priorityBuckets = [
  { priority: 'A' as const, definition: 'Startups ou empresas na iminência de um primeiro FIDC ou operação estruturada relevante.', action: 'Abordagem imediata com tese personalizada.' },
  { priority: 'B' as const, definition: 'Empresas com sinais claros de funding, mas que ainda precisam de enriquecimento.', action: 'Enriquecer antes da abordagem.' },
  { priority: 'C' as const, definition: 'Empresas interessantes para monitoramento, mas sem trigger imediato.', action: 'Monitorar e reciclar com trigger.' },
  { priority: 'Reciclar' as const, definition: 'Empresas que não fazem sentido agora, mas podem fazer no futuro.', action: 'Definir data e condição de retorno.' },
];

export const leadScorecard = [
  { criterion: 'Aderência ao produto DCM', weight: 20, evidence: ['produto financeiro', 'recebíveis', 'funding recorrente', 'ticket mínimo'] },
  { criterion: 'Presença de recebíveis ou carteira', weight: 20, evidence: ['duplicatas', 'cartão', 'mensalidades', 'contratos', 'carteira de crédito'] },
  { criterion: 'Sinal de funding ou crescimento', weight: 15, evidence: ['rodada', 'expansão', 'hiring', 'capex', 'lançamento de crédito'] },
  { criterion: 'Tamanho mínimo da empresa', weight: 10, evidence: ['50+ funcionários', 'escala comercial', 'operação nacional', 'receita recorrente'] },
  { criterion: 'Backing de VC/PE ou investidores relevantes', weight: 10, evidence: ['VC', 'CVC', 'PE', 'investidor institucional'] },
  { criterion: 'Probabilidade de conversa executiva', weight: 10, evidence: ['fundador acessível', 'CFO identificado', 'warm intro', 'fit com Ventures'] },
  { criterion: 'Clareza do produto SRM aplicável', weight: 10, evidence: ['FIDC', 'CRI', 'CRA', 'Debênture', 'Debênture Incentivada'] },
  { criterion: 'Urgência ou trigger recente', weight: 5, evidence: ['notícia recente', 'contratação CFO', 'nova vertical', 'pressão de caixa'] },
];

export const scoreActions = [
  { range: '80-100', action: 'Prioridade máxima; abordagem imediata.' },
  { range: '60-79', action: 'Boa oportunidade; enriquecer antes de abordar.' },
  { range: '40-59', action: 'Monitorar e reciclar.' },
  { range: '0-39', action: 'Baixa prioridade.' },
];

export const operationalFlows = [
  { id: 'flow_lead_generation', name: 'Geração de Leads', steps: ['definir vertical', 'buscar empresas', 'filtrar ICP', 'classificar produto', 'separar prioridade', 'definir próxima ação'] },
  { id: 'flow_research_enrichment', name: 'Pesquisa e Enriquecimento', steps: ['receber empresa', 'pesquisar site/LinkedIn', 'mapear negócio', 'identificar sinais financeiros', 'inferir produto', 'atribuir score'] },
  { id: 'flow_scoring', name: 'Scoring e Priorização', steps: ['lead enriquecido', 'aplicar score', 'classificar prioridade', 'definir produto', 'definir canal', 'enviar pipeline'] },
  { id: 'flow_thesis', name: 'Criação de Tese Comercial', steps: ['empresa qualificada', 'identificar dor', 'conectar produto SRM', 'criar tese', 'preparar abordagem', 'preparar material'] },
  { id: 'flow_outreach', name: 'Abordagem Comercial', steps: ['lead priorizado', 'escolher contato', 'gerar mensagem', 'enviar abordagem', 'registrar retorno', 'agendar ou reciclar'] },
  { id: 'flow_pipeline', name: 'Pipeline Comercial', steps: ['Potenciais Interessados', 'Prospecção', 'Conversa Ventures', 'Intro Empírica', 'Conversa Empírica', 'Envio de Infos', 'Envio Mandato', 'Mandato Assinado', 'Estruturação do Produto', 'Captação', 'Fechado', 'Não Faz Sentido', 'Reciclar'] },
  { id: 'flow_post_meeting', name: 'Pós-Reunião', steps: ['registrar notas', 'mapear dores', 'classificar fit', 'enviar follow-up', 'solicitar informações', 'avançar ou reciclar'] },
];

export const operatingModules = [
  { id: 'company_master', name: 'Company Master', purpose: 'Base única de empresas monitoradas.', implementedBy: ['/companies', 'companies', 'backend/src/repositories/platformRepository.ts'] },
  { id: 'source_catalog', name: 'Source Catalog', purpose: 'Catálogo de fontes usadas na originação.', implementedBy: ['/sources/catalog', 'source_catalog', 'backend/src/data/platformSeeds.ts'] },
  { id: 'monitoring_engine', name: 'Monitoring Engine', purpose: 'Motor de monitoramento de sinais.', implementedBy: ['/monitoring/run', '/monitoring/outputs', 'monitoring_outputs', 'company_signals'] },
  { id: 'enrichment_engine', name: 'Enrichment Engine', purpose: 'Enriquecimento de dados da empresa.', implementedBy: ['enrichments', 'backend/src/services/platformService.ts'] },
  { id: 'trigger_engine', name: 'Trigger Engine', purpose: 'Gatilhos comerciais por evento/sinal.', implementedBy: ['/monitoring/triggers', 'company_signals'] },
  { id: 'thesis_generator', name: 'Thesis Generator', purpose: 'Gerador de tese comercial.', implementedBy: ['/thesis/company/:id', 'backend/src/lib/thesis.ts'] },
  { id: 'crm_pipeline', name: 'CRM / Pipeline', purpose: 'Acompanhamento comercial.', implementedBy: ['/pipeline', '/activities', '/tasks'] },
  { id: 'origination_os', name: 'Origination Operating System', purpose: 'Framework de skills, fluxos, templates e backlog.', implementedBy: ['/api/origination/os', 'backend/src/modules/originationOperatingSystem.ts'] },
];

export const recurringRoutines = {
  daily: ['revisar novos leads', 'atualizar pipeline', 'verificar respostas', 'criar abordagens do dia', 'registrar follow-ups', 'verificar triggers'],
  weekly: ['gerar nova lista por vertical', 'revisar leads sem resposta', 'atualizar score', 'criar ranking semanal', 'separar top 10', 'preparar materiais'],
  monthly: ['revisar ICP', 'medir conversão por canal', 'medir conversão por produto', 'atualizar tese setorial', 'revisar scorecard', 'criar relatório executivo'],
};

export const originationBacklog = [
  { id: 'ORIG-001', title: 'Criar base Company Master', priority: 'Alta', status: 'implemented' as ImplementationStatus, implementation: 'Coberto por companies + CompanyView + CompanyDetailView.' },
  { id: 'ORIG-002', title: 'Criar template de lead enriquecido', priority: 'Alta', status: 'implemented' as ImplementationStatus, implementation: 'Template versionado em originationTemplates.lead.' },
  { id: 'ORIG-003', title: 'Criar scorecard DCM 0-100', priority: 'Alta', status: 'implemented' as ImplementationStatus, implementation: 'Scorecard versionado em leadScorecard; runtime existente em scoring/lead_score_snapshots.' },
  { id: 'ORIG-004', title: 'Criar fluxo padrão de abordagem LinkedIn', priority: 'Alta', status: 'implemented' as ImplementationStatus, implementation: 'Template versionado em originationTemplates.linkedinInitial.' },
  { id: 'ORIG-005', title: 'Criar pipeline comercial com etapas SRM', priority: 'Alta', status: 'runtime_ready' as ImplementationStatus, implementation: 'Fluxo SRM completo versionado; runtime atual usa pipeline operacional simplificado.' },
  { id: 'ORIG-006', title: 'Criar rotina de ranking semanal', priority: 'Alta', status: 'runtime_ready' as ImplementationStatus, implementation: 'Ranking exposto em /rankings/v2 e rotina semanal em recurringRoutines.weekly.' },
  { id: 'ORIG-007', title: 'Criar template de tese por empresa', priority: 'Alta', status: 'implemented' as ImplementationStatus, implementation: 'Template versionado em originationTemplates.thesis.' },
  { id: 'ORIG-008', title: 'Criar base de fontes públicas', priority: 'Alta', status: 'runtime_ready' as ImplementationStatus, implementation: 'Source Catalog existente + documentação das fontes públicas no OS.' },
  { id: 'ORIG-009', title: 'Criar dashboard de originação', priority: 'Média', status: 'runtime_ready' as ImplementationStatus, implementation: 'Dashboard backend em /dashboard/summary e mapa de OS para frontend.' },
  { id: 'ORIG-010', title: 'Criar módulo de triggers', priority: 'Média', status: 'runtime_ready' as ImplementationStatus, implementation: 'Triggers por company_signals + /monitoring/triggers.' },
  { id: 'ORIG-011', title: 'Criar one-pager automático por lead', priority: 'Média', status: 'implemented' as ImplementationStatus, implementation: 'Template versionado em originationTemplates.onePager.' },
  { id: 'ORIG-012', title: 'Criar sequência automática de e-mails', priority: 'Média', status: 'implemented' as ImplementationStatus, implementation: 'Templates de e-mail/follow-up versionados.' },
  { id: 'ORIG-013', title: 'Criar biblioteca de hooks por produto', priority: 'Média', status: 'implemented' as ImplementationStatus, implementation: 'Hooks versionados em productHooks.' },
  { id: 'ORIG-014', title: 'Criar rotina de reciclagem de leads', priority: 'Média', status: 'implemented' as ImplementationStatus, implementation: 'Regras versionadas em recyclingRules.' },
  { id: 'ORIG-015', title: 'Criar monitoramento de portfólios VC/PE', priority: 'Média', status: 'documented' as ImplementationStatus, implementation: 'Incluído como fonte e rotina; conector específico fica plugável no Source Catalog.' },
  { id: 'ORIG-016', title: 'Criar relatório mensal de inteligência setorial', priority: 'Baixa', status: 'implemented' as ImplementationStatus, implementation: 'Template versionado em originationTemplates.monthlySectorReport.' },
  { id: 'ORIG-017', title: 'Criar copiloto comercial contextual', priority: 'Baixa', status: 'runtime_ready' as ImplementationStatus, implementation: 'AI router existente + contexto do OS para respostas comerciais.' },
  { id: 'ORIG-018', title: 'Criar integração com bases externas', priority: 'Baixa', status: 'runtime_ready' as ImplementationStatus, implementation: 'Source Catalog e connectors existentes; novas fontes ficam no mesmo contrato.' },
  { id: 'ORIG-019', title: 'Criar histórico de evolução de score', priority: 'Baixa', status: 'runtime_ready' as ImplementationStatus, implementation: 'score_snapshots + lead_score_snapshots + endpoints de histórico.' },
  { id: 'ORIG-020', title: 'Criar módulo de comparáveis', priority: 'Baixa', status: 'runtime_ready' as ImplementationStatus, implementation: 'market_map + peers + /market-map/company/:id.' },
];

export const productHooks: Record<OriginationProduct, string[]> = {
  FIDC: ['funding recorrente para carteira', 'capital não dilutivo', 'separação entre caixa corporativo e carteira', 'take-out para warehouse/bridge'],
  CRI: ['monetização de recebíveis imobiliários', 'funding para carteira de contratos', 'estruturação de fluxo imobiliário'],
  CRA: ['funding sazonal para cadeia agro', 'recebíveis agro estruturados', 'capital para safra/insumos'],
  Debenture: ['dívida corporativa institucional', 'funding para expansão', 'alongamento de passivo'],
  'Debenture Incentivada': ['captação incentivada para infraestrutura', 'benefício fiscal para investidor', 'funding de capex elegível'],
};

export const recyclingRules = [
  { condition: 'sem resposta após 3 contatos', action: 'mover para Reciclar por 45-60 dias e reativar com novo trigger' },
  { condition: 'sem fit de produto agora', action: 'registrar motivo e monitorar mudança de funding/produto' },
  { condition: 'empresa pequena demais', action: 'reavaliar após sinal de escala, rodada ou contratação financeira' },
  { condition: 'produto ainda imaturo', action: 'monitorar lançamento, carteira e crescimento de clientes' },
];

export const initialVerticals = ['Fintechs com crédito/recebíveis', 'Plataformas B2B com fluxo financeiro', 'Marketplaces', 'SaaS com receita recorrente', 'Healthtechs com recebíveis', 'Edtechs com mensalidades', 'Agtechs', 'Proptechs', 'Energia/infraestrutura', 'Meios de pagamento'];

export const leadChecklist = [
  'A empresa está no Brasil?',
  'Tem porte mínimo razoável?',
  'Tem recebíveis, carteira, contratos ou fluxo financeiro recorrente?',
  'Existe produto SRM aplicável?',
  'Existe hipótese clara de dor?',
  'Há contato executivo identificado?',
  'Existe hook personalizado?',
  'A empresa foi classificada no score?',
  'A próxima ação está definida?',
  'A fonte da informação foi registrada?',
];

export const originationTemplates = {
  lead: ['Empresa', 'Site', 'LinkedIn', 'Setor', 'Subsetor', 'Localização', 'Funcionários estimados', 'Modelo de negócio', 'Recebíveis identificados', 'Produto SRM sugerido', 'Prioridade', 'Score', 'Contato-alvo', 'Cargo', 'Gatilho identificado', 'Tese de abordagem', 'Próxima ação', 'Fonte', 'Data da análise'],
  thesis: 'A [EMPRESA] atua em [SETOR] e apresenta sinais de [SINAL]. Pelo modelo de negócio, pode haver aderência a [PRODUTO SRM], especialmente se houver [CONDIÇÃO]. A conversa inicial deve ser consultiva, buscando entender [DOR/NECESSIDADE].',
  linkedinInitial: '[NOME], bom dia. Tudo bem? Faço parte do time de DCM da SRM e venho acompanhando empresas que estão crescendo em modelos com potencial de uso de crédito estruturado. Achei que poderia fazer sentido me aproximar da [EMPRESA] para entender melhor o momento da companhia e avaliar possíveis sinergias com a SRM.',
  followUpShort: '[NOME], passando só para retomar meu contato. A ideia é uma conversa bem exploratória para entender o momento da [EMPRESA] e avaliar se alguma estrutura de DCM pode fazer sentido agora ou mais à frente. Faz sentido falarmos rapidamente?',
  emailConsultative: 'Assunto: Conversa exploratória — SRM / [EMPRESA]\n\n[NOME], bom dia. Tudo bem?\n\nFaço parte do time de DCM da SRM e gostaria de me aproximar da [EMPRESA] para conhecer melhor o momento da companhia. Atuamos na originação, estruturação, distribuição e gestão de operações de crédito estruturado, incluindo FIDC, CRI, CRA, Debêntures e Debêntures Incentivadas. Pelo perfil da [EMPRESA], acredito que pode fazer sentido uma conversa consultiva para entendermos se existe alguma oportunidade de sinergia, seja agora ou em uma agenda futura de funding.',
  onePager: ['nome da empresa', 'tese de oportunidade', 'modelo de negócio', 'sinais de funding', 'produto SRM sugerido', 'racional da operação', 'próximo passo comercial'],
  monthlySectorReport: ['ranking top 10', 'triggers do mês', 'novas empresas', 'conversões por canal', 'conversões por produto', 'aprendizados', 'ajustes no ICP'],
};

export const commandCatalog = [
  { command: 'Execute nosso fluxo completo para a empresa [NOME/LINK].', output: ['resumo', 'modelo de negócio', 'sinais de funding', 'produto SRM', 'score', 'tese', 'abordagem', 'próxima ação'] },
  { command: 'Gere uma lista de leads para [VERTICAL], com potencial para [PRODUTO].', output: ['prioridade A', 'prioridade B', 'prioridade C', 'racional', 'próxima ação'] },
  { command: 'Crie uma abordagem consultiva para [NOME], [CARGO] da [EMPRESA].', output: ['LinkedIn', 'e-mail', 'follow-up'] },
  { command: 'Crie um one-pager comercial da oportunidade [EMPRESA].', output: ['tese', 'produto sugerido', 'racional', 'próximo passo'] },
];

export const implementationMap = {
  status: 'implemented',
  completedAt: '2026-05-28',
  layers: [
    'skill tree versionada em código',
    'backlog ORIG-001 a ORIG-020 convertido em contrato operacional',
    'templates de lead/tese/abordagem/one-pager versionados',
    'migration SQL para persistência no Supabase',
    'documentação em docs/origination',
    'endpoints serverless /api/origination/*',
  ],
  runtimeEndpoints: ['/api/origination/os', '/api/origination/backlog', '/api/origination/templates', '/api/origination/execution-plan'],
};

export const getOriginationExecutionPlan = () => ({
  now: ['usar /api/origination/os como fonte do framework', 'rodar /rankings/v2 para top leads', 'executar fluxo completo para prioridades A', 'registrar ações em /tasks e /activities'],
  next: ['ligar frontend a /api/origination/os', 'popular Supabase com migration 020', 'configurar conector VC/PE dedicado', 'automatizar relatório mensal'],
  kpis: ['leads gerados/semana', 'leads qualificados/semana', 'abordagens enviadas', 'respostas', 'reuniões', 'mandatos enviados', 'mandatos assinados', 'operações fechadas'],
});

export const getOriginationOperatingSystem = () => ({
  version: ORIGINATION_OPERATING_SYSTEM_VERSION,
  thesis: 'Máquina de originação inteligente para detectar sinais precoces de necessidade de funding e transformar inteligência em conversas qualificadas para FIDC, CRI, CRA, Debênture e Debênture Incentivada.',
  products: originationProducts,
  structures: srmStructures,
  skills: originationSkillTree,
  priorities: priorityBuckets,
  scorecard: leadScorecard,
  scoreActions,
  flows: operationalFlows,
  modules: operatingModules,
  routines: recurringRoutines,
  backlog: originationBacklog,
  hooks: productHooks,
  recyclingRules,
  initialVerticals,
  checklist: leadChecklist,
  templates: originationTemplates,
  commands: commandCatalog,
  implementation: implementationMap,
});

export const getOriginationBacklog = () => originationBacklog;
export const getOriginationTemplates = () => originationTemplates;
export const getOriginationChecklist = () => leadChecklist;
