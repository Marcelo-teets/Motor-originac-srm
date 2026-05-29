export const ORIGINATION_OPERATING_SYSTEM_VERSION = '2026.05.28.2';

export type OriginationPriority = 'A' | 'B' | 'C' | 'Reciclar';
export type OriginationProduct = 'FIDC' | 'CRI' | 'CRA' | 'Debenture' | 'Debenture Incentivada';
export type ImplementationStatus = 'implemented' | 'runtime_ready' | 'documented' | 'planned';

export const originationProducts: Array<{
  product: OriginationProduct;
  useCase: string;
  idealCompanyProfile: string[];
  qualificationSignals: string[];
  commercialAngle: string;
}> = [
  {
    product: 'FIDC',
    useCase: 'Recebíveis recorrentes, carteira pulverizada, antecipação, crédito embarcado, mensalidades, adquirência, contratos recorrentes e capital de giro estruturado.',
    idealCompanyProfile: ['fintechs', 'SaaS com carteira recorrente', 'marketplaces', 'plataformas B2B', 'healthtechs', 'edtechs', 'empresas com recebíveis performados ou pulverizados'],
    qualificationSignals: ['recebíveis recorrentes', 'produto de crédito', 'volume transacional', 'necessidade de funding não dilutivo', 'crescimento de carteira', 'inadimplência administrável', 'primeira estrutura institucional possível'],
    commercialAngle: 'Estruturar funding não dilutivo e escalável para transformar recebíveis/carteiras em motor de crescimento, com prioridade para empresas na iminência de um primeiro FIDC.',
  },
  {
    product: 'CRI',
    useCase: 'Recebíveis imobiliários, contratos imobiliários, loteamento, incorporação, aluguel, built-to-suit ou plataformas com fluxo imobiliário.',
    idealCompanyProfile: ['proptechs', 'incorporadoras', 'loteadoras', 'plataformas imobiliárias', 'empresas com carteira de contratos imobiliários'],
    qualificationSignals: ['recebíveis imobiliários', 'contratos de compra e venda', 'fluxo de parcelas', 'estoque imobiliário', 'necessidade de funding para obra, aquisição ou carteira'],
    commercialAngle: 'Converter fluxo imobiliário em estrutura de mercado de capitais com tese objetiva de lastro, prazo e fonte de pagamento.',
  },
  {
    product: 'CRA',
    useCase: 'Recebíveis do agronegócio, CPR, insumos, cadeia agro, distribuição, barter e contratos comerciais ligados ao agro.',
    idealCompanyProfile: ['agtechs', 'tradings', 'cooperativas', 'distribuidores de insumos', 'empresas da cadeia agro', 'plataformas de crédito agro'],
    qualificationSignals: ['recebíveis agro', 'safra', 'CPR', 'contratos com produtores', 'capital de giro sazonal', 'carteira pulverizada de produtores'],
    commercialAngle: 'Estruturar financiamento alinhado ao ciclo agro, usando lastro elegível e tese de risco ligada à cadeia produtiva.',
  },
  {
    product: 'Debenture',
    useCase: 'Dívida corporativa estruturada para empresas com porte, governança, previsibilidade de caixa e necessidade de capital de expansão ou refinanciamento.',
    idealCompanyProfile: ['middle market', 'scale-ups maduras', 'empresas tech-based', 'companhias com plano de expansão', 'empresas com EBITDA ou receita recorrente relevante'],
    qualificationSignals: ['ticket potencial acima de R$ 20MM', 'governança mínima', 'funding de expansão', 'estrutura corporativa clara', 'capacidade de prestação de informações'],
    commercialAngle: 'Criar alternativa institucional de dívida corporativa quando o ativo não pede securitização pura ou quando a empresa precisa alongar passivo.',
  },
  {
    product: 'Debenture Incentivada',
    useCase: 'Projetos elegíveis de infraestrutura com benefício fiscal, especialmente energia, saneamento, logística, telecom e infraestrutura digital.',
    idealCompanyProfile: ['energia', 'saneamento', 'logística', 'telecom', 'infraestrutura digital', 'projetos regulados ou autorizados'],
    qualificationSignals: ['capex elegível', 'projeto de infraestrutura', 'receita contratada', 'autorização/regulação setorial', 'investidores PF/institucionais'],
    commercialAngle: 'Viabilizar captação incentivada para projetos elegíveis, com narrativa de impacto, lastro regulatório e benefício fiscal ao investidor.',
  },
];

export const srmStructures = [
  { name: 'SRM Ventures', role: 'Originação, relacionamento com startups, tese comercial, aproximação com fundadores/CFOs e leitura de mercado tech/startups.' },
  { name: 'SRM Empírica', role: 'Gestão, estruturação, fundos, leitura técnica, governança institucional, administração de teses e ponte com investidores.' },
  { name: 'SRM Asset', role: 'Gestão de veículos, estruturação de produtos de crédito, disciplina de risco e arquitetura de alocação.' },
  { name: 'DCM SRM', role: 'Originação, estruturação, distribuição, mandato, execução, coordenação comercial e acompanhamento do pipeline.' },
];

export const operatingPrinciples = [
  'Brasil-only até o produto maturar.',
  'Foco exclusivo nos produtos FIDC, CRI, CRA, Debênture e Debênture Incentivada.',
  'Separar fatos observados, inferências e estimativas em toda análise.',
  'Toda recomendação deve apontar fonte, racional, produto sugerido e próxima ação.',
  'Priorizar empresas com sinal precoce de necessidade de funding antes do mercado.',
  'Tratar a plataforma como um sistema comercial vivo: pesquisar, qualificar, abordar, registrar, aprender e reciclar.',
  'Usar SRM Ventures, SRM Empírica e SRM Asset conforme o melhor ângulo de entrada e execução.',
];

export const originationSkillTree = [
  {
    id: 'skill_research',
    name: 'Research Skills',
    objective: 'Coletar, organizar e interpretar informações públicas, comerciais e estratégicas sobre empresas, setores e sinais de funding.',
    inputs: ['nome da empresa', 'site', 'LinkedIn', 'CNPJ', 'setor', 'notícias', 'rodadas', 'produtos', 'sinais de recebíveis/crédito/funding'],
    outputs: ['resumo da empresa', 'modelo de negócio', 'sinais de funding', 'produto SRM sugerido', 'riscos', 'fontes', 'grau de confiança'],
    tasks: ['mapear modelo de negócio', 'separar fatos de hipóteses', 'capturar sinais de expansão/funding', 'classificar produto DCM aplicável', 'registrar fonte e data'],
    qualityBar: ['não inventar dado ausente', 'marcar inferência como inferência', 'priorizar fontes oficiais e públicas verificáveis'],
  },
  {
    id: 'skill_lead_generator',
    name: 'Lead Generator',
    objective: 'Gerar listas de empresas com potencial de originação DCM e priorizar por aderência comercial.',
    inputs: ['vertical', 'produto', 'tamanho mínimo', 'região', 'tipo de empresa', 'sinais esperados'],
    outputs: ['lista de leads', 'prioridade A/B/C/Reciclar', 'produto sugerido', 'próxima ação'],
    tasks: ['mapear empresas', 'filtrar ICP', 'remover nomes fora da tese', 'criar ranking mínimo por categoria', 'garantir ao menos 10 nomes quando solicitado'],
    qualityBar: ['não inflar lista com bancos/players fora da tese', 'explicar por que cada lead entra', 'separar prioridade A de empresas já maduras demais'],
  },
  {
    id: 'skill_icp_decoder',
    name: 'ICP Decoder',
    objective: 'Traduzir o perfil ideal de cliente em critérios objetivos de qualificação.',
    inputs: ['segmento', 'porte', 'recebíveis', 'modelo de receita', 'funding atual', 'governança'],
    outputs: ['fit com ICP', 'sinais positivos', 'sinais negativos', 'nível de prioridade'],
    tasks: ['avaliar porte', 'avaliar recorrência', 'avaliar funding gap', 'avaliar maturidade para DCM', 'definir produto elegível'],
    qualityBar: ['usar critérios replicáveis', 'diferenciar bom negócio de bom lead DCM', 'não priorizar só por fama da empresa'],
  },
  {
    id: 'skill_profile_architect',
    name: 'Profile Architect',
    objective: 'Construir o perfil comercial da empresa para apoiar abordagem e tese.',
    inputs: ['dados cadastrais', 'site', 'LinkedIn', 'modelo de negócio', 'contatos', 'sinais financeiros'],
    outputs: ['perfil comercial', 'dor provável', 'produto indicado', 'contato-alvo', 'próximo passo'],
    tasks: ['resumir negócio', 'mapear receita', 'identificar recebíveis', 'definir ângulo comercial', 'montar ficha executiva'],
    qualityBar: ['ser objetivo', 'usar linguagem de banco de investimento', 'deixar claro o que falta descobrir na conversa'],
  },
  {
    id: 'skill_hook_engineer',
    name: 'Hook Engineer',
    objective: 'Criar ganchos comerciais personalizados para fundadores, CFOs e executivos.',
    inputs: ['empresa', 'dor provável', 'produto SRM', 'cargo do contato', 'trigger recente'],
    outputs: ['hook consultivo', 'mensagem LinkedIn', 'e-mail inicial', 'follow-up'],
    tasks: ['escolher ângulo', 'evitar venda genérica', 'conectar sinal com produto', 'gerar variações de abordagem'],
    qualityBar: ['tom consultivo', 'sem prometer crédito', 'sem parecer disparo em massa'],
  },
  {
    id: 'skill_deck_composer',
    name: 'Carousel / Deck Composer',
    objective: 'Gerar materiais comerciais, one-pagers, apresentações, IC memos preliminares e narrativas visuais.',
    inputs: ['tese', 'empresa', 'produto', 'racional', 'dados-chave'],
    outputs: ['one-pager', 'mini deck', 'memo interno', 'carrossel', 'IC memo preliminar'],
    tasks: ['organizar tese', 'transformar análise em narrativa', 'criar material de apoio', 'preparar versão executiva'],
    qualityBar: ['começar pelo racional da operação', 'evitar excesso de texto', 'explicitar produto e próximo passo'],
  },
  {
    id: 'skill_sequencer',
    name: 'DM / Email Sequencer',
    objective: 'Criar sequências de abordagem por LinkedIn, e-mail, WhatsApp e follow-up.',
    inputs: ['contato', 'canal', 'empresa', 'produto', 'tese', 'status no pipeline'],
    outputs: ['mensagem inicial', 'follow-up', 'e-mail consultivo', 'reativação'],
    tasks: ['gerar sequência', 'controlar tom', 'adaptar por persona', 'registrar próxima ação'],
    qualityBar: ['mensagens curtas no LinkedIn', 'e-mail com contexto e tese', 'follow-up suave e objetivo'],
  },
  {
    id: 'skill_lead_scorer',
    name: 'Lead Scorer',
    objective: 'Classificar leads com base em critérios comerciais, financeiros e estratégicos.',
    inputs: ['fit produto', 'recebíveis', 'funding signal', 'porte', 'backing VC/PE', 'probabilidade de conversa', 'trigger'],
    outputs: ['score 0-100', 'bucket', 'rationale', 'próxima ação'],
    tasks: ['aplicar scorecard', 'priorizar', 'gerar justificativa', 'alimentar ranking'],
    qualityBar: ['score sempre explicado', 'ação conectada ao score', 'revisar quando houver novo sinal'],
  },
] as const;

export const priorityBuckets = [
  { priority: 'A' as const, definition: 'Startups ou empresas na iminência de um primeiro FIDC ou primeira operação estruturada relevante, com sinal claro de carteira/recebíveis/funding e porte mínimo.', action: 'Abordagem imediata com tese personalizada e contato fundador/CFO.' },
  { priority: 'B' as const, definition: 'Empresas com sinais claros de funding e possível aderência a FIDC/CRI/CRA/Debênture, mas que ainda precisam de enriquecimento ou confirmação de dados.', action: 'Enriquecer antes da abordagem e preparar hook.' },
  { priority: 'C' as const, definition: 'Empresas interessantes para monitoramento, mas sem trigger imediato, porte suficiente ou clareza de produto.', action: 'Monitorar, esperar novo sinal e reciclar com trigger.' },
  { priority: 'Reciclar' as const, definition: 'Empresas que não fazem sentido agora, já estão maduras demais para a tese, não têm produto elegível ou não têm timing comercial.', action: 'Registrar motivo, condição de retorno e próxima data de reavaliação.' },
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
  { range: '80-100', action: 'Prioridade máxima; abordagem imediata com tese personalizada.' },
  { range: '60-79', action: 'Boa oportunidade; enriquecer antes de abordar ou buscar warm intro.' },
  { range: '40-59', action: 'Monitorar e reciclar; abordar apenas com trigger forte.' },
  { range: '0-39', action: 'Baixa prioridade; arquivar ou manter em watchlist de longo prazo.' },
];

export const pipelineStages = [
  'Potenciais Interessados',
  'Prospecção',
  'Conversa Ventures',
  'Intro Empírica',
  'Conversa Empírica',
  'Envio de Infos',
  'Envio Mandato',
  'Mandato Assinado',
  'Estruturação do Produto',
  'Captação',
  'Fechado',
  'Não Faz Sentido',
  'Reciclar',
];

export const operationalFlows = [
  { id: 'flow_lead_generation', name: 'Geração de Leads', steps: ['definir vertical/produto', 'buscar empresas em fontes públicas', 'filtrar Brasil-only e porte mínimo', 'remover empresas fora da tese', 'classificar produto SRM', 'separar prioridade A/B/C/Reciclar', 'definir próxima ação'] },
  { id: 'flow_research_enrichment', name: 'Pesquisa e Enriquecimento', steps: ['receber empresa/link', 'pesquisar site/LinkedIn/CNPJ/notícias', 'mapear negócio', 'identificar sinais financeiros', 'separar observado/inferido/estimado', 'inferir produto', 'atribuir score'] },
  { id: 'flow_scoring', name: 'Scoring e Priorização', steps: ['lead enriquecido', 'aplicar scorecard 0-100', 'classificar prioridade', 'definir produto', 'definir canal de abordagem', 'enviar para pipeline'] },
  { id: 'flow_thesis', name: 'Criação de Tese Comercial', steps: ['empresa qualificada', 'identificar dor provável', 'conectar produto SRM', 'criar tese', 'preparar abordagem', 'preparar material'] },
  { id: 'flow_outreach', name: 'Abordagem Comercial', steps: ['lead priorizado', 'escolher contato', 'gerar mensagem por persona', 'enviar abordagem', 'registrar retorno', 'agendar conversa ou reciclar'] },
  { id: 'flow_pipeline', name: 'Pipeline Comercial SRM', steps: pipelineStages },
  { id: 'flow_post_meeting', name: 'Pós-Reunião', steps: ['registrar notas', 'mapear dores', 'classificar fit', 'enviar follow-up', 'solicitar informações', 'avançar ou reciclar'] },
  { id: 'flow_weekly_intelligence', name: 'Inteligência Semanal', steps: ['rodar ranking', 'revisar top leads', 'identificar triggers', 'atualizar score', 'selecionar top 10', 'produzir abordagens da semana'] },
  { id: 'flow_recycling', name: 'Reciclagem de Leads', steps: ['identificar motivo de pausa', 'definir condição de retorno', 'agendar nova revisão', 'monitorar triggers', 'reativar com novo hook'] },
];

export const sourceCatalogPlaybook = [
  { source: 'LinkedIn', use: 'identificar empresa, fundadores, CFOs, headcount, crescimento e movimentações comerciais', evidenceType: 'observado' },
  { source: 'site institucional', use: 'entender produto, clientes, casos de uso, receita provável e tese de recebíveis', evidenceType: 'observado' },
  { source: 'CNPJ / dados cadastrais públicos', use: 'validar razão social, idade da empresa, CNAE e localização', evidenceType: 'observado' },
  { source: 'notícias e press releases', use: 'capturar rodadas, expansão, lançamentos, capex, parcerias e funding', evidenceType: 'observado' },
  { source: 'portfólios VC/PE', use: 'mapear backing, warm paths e empresas tech-backed com potencial de funding', evidenceType: 'observado' },
  { source: 'CVM / ANBIMA / dados públicos de fundos', use: 'detectar histórico de FIDC, CRI, CRA ou estruturas existentes', evidenceType: 'observado' },
  { source: 'sites setoriais e rankings', use: 'expandir cobertura por vertical e encontrar empresas fora do radar óbvio', evidenceType: 'observado/inferido' },
];

export const signalTaxonomy = [
  { signal: 'carteira de crédito ou antecipação', productBias: 'FIDC', strength: 'forte' },
  { signal: 'mensalidades, contratos ou receita recorrente pulverizada', productBias: 'FIDC', strength: 'forte' },
  { signal: 'recebíveis imobiliários ou contratos de compra e venda', productBias: 'CRI', strength: 'forte' },
  { signal: 'CPR, barter, safra, insumos ou cadeia agro', productBias: 'CRA', strength: 'forte' },
  { signal: 'capex de infraestrutura elegível', productBias: 'Debenture Incentivada', strength: 'forte' },
  { signal: 'expansão acelerada sem clareza de recebível específico', productBias: 'Debenture', strength: 'médio' },
  { signal: 'rodada recente com plano de crescimento', productBias: 'FIDC/Debenture', strength: 'médio' },
  { signal: 'contratação de CFO/financeiro sênior', productBias: 'qualquer produto', strength: 'médio' },
  { signal: 'empresa muito madura/banco/licenciada como instituição financeira robusta', productBias: 'avaliar caso a caso', strength: 'redutor para prioridade A' },
];

export const operatingModules = [
  { id: 'company_master', name: 'Company Master', purpose: 'Base única de empresas monitoradas.', implementedBy: ['/companies', 'companies', 'backend/src/repositories/platformRepository.ts'] },
  { id: 'source_catalog', name: 'Source Catalog', purpose: 'Catálogo de fontes usadas na originação.', implementedBy: ['/sources/catalog', 'source_catalog', 'backend/src/data/platformSeeds.ts'] },
  { id: 'monitoring_engine', name: 'Monitoring Engine', purpose: 'Motor de monitoramento de sinais.', implementedBy: ['/monitoring/run', '/monitoring/outputs', 'monitoring_outputs', 'company_signals'] },
  { id: 'research_engine', name: 'Research Engine', purpose: 'Orquestra pesquisa por empresa e diferencia fato, inferência e estimativa.', implementedBy: ['/api/origination/os', 'sourceCatalogPlaybook', 'signalTaxonomy'] },
  { id: 'enrichment_engine', name: 'Enrichment Engine', purpose: 'Enriquecimento de dados da empresa.', implementedBy: ['enrichments', 'backend/src/services/platformService.ts'] },
  { id: 'trigger_engine', name: 'Trigger Engine', purpose: 'Gatilhos comerciais por evento/sinal.', implementedBy: ['/monitoring/triggers', 'company_signals'] },
  { id: 'lead_generation_engine', name: 'Lead Generation Engine', purpose: 'Geração de listas por vertical/produto com prioridade A/B/C/Reciclar.', implementedBy: ['originationSkillTree', 'leadGenerationPlaybooks'] },
  { id: 'thesis_generator', name: 'Thesis Generator', purpose: 'Gerador de tese comercial.', implementedBy: ['/thesis/company/:id', 'backend/src/lib/thesis.ts'] },
  { id: 'crm_pipeline', name: 'CRM / Pipeline', purpose: 'Acompanhamento comercial.', implementedBy: ['/pipeline', '/activities', '/tasks'] },
  { id: 'origination_os', name: 'Origination Operating System', purpose: 'Framework de skills, fluxos, templates, backlog, comandos e governança.', implementedBy: ['/api/origination/os', 'backend/src/modules/originationOperatingSystem.ts'] },
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
  { id: 'ORIG-021', title: 'Consolidar Origination Skill Tree no backend', priority: 'Alta', status: 'implemented' as ImplementationStatus, implementation: 'Skills Lead Generator, ICP Decoder, Profile Architect, Hook Engineer, Deck Composer, Sequencer, Lead Scorer e Research Skills versionadas neste módulo.' },
  { id: 'ORIG-022', title: 'Criar playbooks de geração de leads por vertical', priority: 'Alta', status: 'implemented' as ImplementationStatus, implementation: 'leadGenerationPlaybooks define verticais, produtos prováveis, sinais e exclusões.' },
  { id: 'ORIG-023', title: 'Criar taxonomia de sinais DCM', priority: 'Alta', status: 'implemented' as ImplementationStatus, implementation: 'signalTaxonomy diferencia sinais fortes, médios e redutores por produto.' },
  { id: 'ORIG-024', title: 'Formalizar governança observado/inferido/estimado', priority: 'Alta', status: 'implemented' as ImplementationStatus, implementation: 'operatingPrinciples e sourceCatalogPlaybook incorporam a regra de evidência.' },
  { id: 'ORIG-025', title: 'Criar prompt operacional de fluxo completo por empresa', priority: 'Alta', status: 'implemented' as ImplementationStatus, implementation: 'commandCatalog.flowCompleto e originationTemplates.companyFlowOutput.' },
  { id: 'ORIG-026', title: 'Criar padrão de abordagem consultiva para fundadores', priority: 'Alta', status: 'implemented' as ImplementationStatus, implementation: 'originationTemplates.linkedinInitial, emailConsultative, founderColdEmail e followUps.' },
  { id: 'ORIG-027', title: 'Criar padrão de lista mínima por prioridade', priority: 'Média', status: 'implemented' as ImplementationStatus, implementation: 'Lead Generator inclui qualidade mínima e instrução de ao menos 10 nomes por lista quando solicitado.' },
  { id: 'ORIG-028', title: 'Conectar frontend Command Center aos endpoints /api/origination/*', priority: 'Alta', status: 'planned' as ImplementationStatus, implementation: 'Próximo passo de produto: painel visual de skills, fluxos, templates e execução.' },
  { id: 'ORIG-029', title: 'Persistir execuções de skills e prompts', priority: 'Média', status: 'planned' as ImplementationStatus, implementation: 'Criar tabela/event log para cada execução de skill, input, output, fontes e próximo passo.' },
  { id: 'ORIG-030', title: 'Criar conector VC/PE dedicado', priority: 'Média', status: 'documented' as ImplementationStatus, implementation: 'Fonte mapeada em sourceCatalogPlaybook; implementação incremental em connectors.' },
];

export const productHooks: Record<OriginationProduct, string[]> = {
  FIDC: ['funding recorrente para carteira', 'capital não dilutivo', 'separação entre caixa corporativo e carteira', 'take-out para warehouse/bridge', 'primeiro FIDC como evolução natural da esteira de crédito'],
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
  { condition: 'empresa madura demais para prioridade A', action: 'reclassificar para B/C ou tratar como benchmark/comparável' },
];

export const initialVerticals = ['Fintechs com crédito/recebíveis', 'Plataformas B2B com fluxo financeiro', 'Marketplaces', 'SaaS com receita recorrente', 'Healthtechs com recebíveis', 'Edtechs com mensalidades', 'Agtechs', 'Proptechs', 'Energia/infraestrutura', 'Meios de pagamento'];

export const leadGenerationPlaybooks = [
  { vertical: 'Fintechs com crédito/recebíveis', products: ['FIDC'], searchSignals: ['carteira de crédito', 'antecipação', 'BNPL', 'cartão', 'empréstimo', 'recebíveis'], exclude: ['bancos grandes', 'instituições maduras demais sem tese de primeiro FIDC'] },
  { vertical: 'SaaS B2B com receita recorrente', products: ['FIDC', 'Debenture'], searchSignals: ['mensalidades', 'contratos recorrentes', 'base pulverizada', 'expansão enterprise'], exclude: ['SaaS sem fluxo financeiro ou sem porte mínimo'] },
  { vertical: 'Healthtechs', products: ['FIDC', 'Debenture'], searchSignals: ['clínicas', 'planos', 'recebíveis de saúde', 'SaaS para saúde', 'cobrança recorrente'], exclude: ['marketplace puramente informacional'] },
  { vertical: 'Edtechs', products: ['FIDC'], searchSignals: ['mensalidades', 'financiamento estudantil', 'contratos com alunos/escolas', 'receita recorrente'], exclude: ['conteúdo gratuito sem monetização clara'] },
  { vertical: 'Agtechs', products: ['CRA', 'FIDC'], searchSignals: ['CPR', 'produtores', 'insumos', 'safra', 'barter', 'crédito agro'], exclude: ['software agro sem fluxo financeiro'] },
  { vertical: 'Proptechs', products: ['CRI', 'FIDC'], searchSignals: ['aluguéis', 'parcelas imobiliárias', 'compra e venda', 'condomínio', 'loteamento'], exclude: ['portal sem controle de fluxo'] },
  { vertical: 'Infraestrutura digital/energia', products: ['Debenture Incentivada', 'Debenture'], searchSignals: ['capex', 'projeto autorizado', 'energia', 'telecom', 'data center', 'contratos longos'], exclude: ['projeto sem elegibilidade ou escala'] },
];

export const leadChecklist = [
  'A empresa está no Brasil?',
  'Tem porte mínimo razoável?',
  'Tem recebíveis, carteira, contratos ou fluxo financeiro recorrente?',
  'Existe produto SRM aplicável entre FIDC, CRI, CRA, Debênture ou Debênture Incentivada?',
  'Existe hipótese clara de dor?',
  'Há contato executivo identificado?',
  'Existe hook personalizado?',
  'A empresa foi classificada no score?',
  'A próxima ação está definida?',
  'A fonte da informação foi registrada?',
  'O que é fato, inferência e estimativa está separado?',
];

export const originationTemplates = {
  lead: ['Empresa', 'Site', 'LinkedIn', 'CNPJ', 'Setor', 'Subsetor', 'Localização', 'Funcionários estimados', 'Modelo de negócio', 'Recebíveis identificados', 'Produto SRM sugerido', 'Prioridade', 'Score', 'Contato-alvo', 'Cargo', 'Gatilho identificado', 'Tese de abordagem', 'Próxima ação', 'Fonte', 'Data da análise', 'Confiança'],
  companyFlowOutput: ['Resumo executivo', 'Modelo de negócio', 'Sinais observados', 'Inferências', 'Estimativas', 'Produto SRM sugerido', 'Score 0-100', 'Prioridade', 'Tese comercial', 'Abordagem sugerida', 'Próxima ação', 'Fontes'],
  thesis: 'A [EMPRESA] atua em [SETOR] e apresenta sinais de [SINAL]. Pelo modelo de negócio, pode haver aderência a [PRODUTO SRM], especialmente se houver [CONDIÇÃO]. A conversa inicial deve ser consultiva, buscando entender [DOR/NECESSIDADE].',
  linkedinInitial: '[NOME], bom dia. Tudo bem? Faço parte do time de DCM da SRM e venho acompanhando empresas que estão crescendo em modelos com potencial de uso de crédito estruturado. Achei que poderia fazer sentido me aproximar da [EMPRESA] para entender melhor o momento da companhia e avaliar possíveis sinergias com a SRM.',
  linkedinFounder: '[NOME], tudo bem? Faço parte do time de DCM da SRM e estou me aproximando de fundadores de empresas tech que podem se beneficiar de funding estruturado não dilutivo. Gostaria de conhecer melhor o momento da [EMPRESA] e trocar ideias de forma exploratória.',
  followUpShort: '[NOME], passando só para retomar meu contato. A ideia é uma conversa bem exploratória para entender o momento da [EMPRESA] e avaliar se alguma estrutura de DCM pode fazer sentido agora ou mais à frente. Faz sentido falarmos rapidamente?',
  emailConsultative: 'Assunto: Conversa exploratória — SRM / [EMPRESA]\n\n[NOME], bom dia. Tudo bem?\n\nFaço parte do time de DCM da SRM e gostaria de me aproximar da [EMPRESA] para conhecer melhor o momento da companhia. Atuamos na originação, estruturação, distribuição e gestão de operações de crédito estruturado, incluindo FIDC, CRI, CRA, Debêntures e Debêntures Incentivadas. Pelo perfil da [EMPRESA], acredito que pode fazer sentido uma conversa consultiva para entendermos se existe alguma oportunidade de sinergia, seja agora ou em uma agenda futura de funding.',
  founderColdEmail: 'Assunto: Funding estruturado para a [EMPRESA]\n\n[NOME], bom dia. Tudo bem?\n\nFaço parte do time de DCM da SRM. Temos conversado com fundadores de empresas tech que estão avaliando alternativas de funding não dilutivo, especialmente quando existe carteira, recebíveis, contratos recorrentes ou necessidade de capital para escalar. Achei que poderia fazer sentido conhecer melhor o momento da [EMPRESA] e entender se existe algum caminho de FIDC, CRI, CRA ou Debênture que faça sentido agora ou no médio prazo.',
  onePager: ['nome da empresa', 'tese de oportunidade', 'modelo de negócio', 'sinais de funding', 'produto SRM sugerido', 'racional da operação', 'riscos a validar', 'próximo passo comercial'],
  monthlySectorReport: ['ranking top 10', 'triggers do mês', 'novas empresas', 'conversões por canal', 'conversões por produto', 'aprendizados', 'ajustes no ICP'],
};

export const commandCatalog = [
  { command: 'Execute nosso fluxo completo para a empresa [NOME/LINK].', output: ['resumo', 'modelo de negócio', 'sinais observados', 'inferências', 'produto SRM', 'score', 'tese', 'abordagem', 'próxima ação'] },
  { command: 'Gere uma lista de leads para [VERTICAL], com potencial para [PRODUTO].', output: ['prioridade A', 'prioridade B', 'prioridade C', 'racional', 'próxima ação'] },
  { command: 'Gere leads de fintechs com potencial para FIDC, com prioridade A para startups na iminência de primeiro FIDC.', output: ['mínimo 10 nomes por prioridade quando possível', 'racional por lead', 'exclusões relevantes'] },
  { command: 'Crie uma abordagem consultiva para [NOME], [CARGO] da [EMPRESA].', output: ['LinkedIn', 'e-mail', 'follow-up'] },
  { command: 'Crie um one-pager comercial da oportunidade [EMPRESA].', output: ['tese', 'produto sugerido', 'racional', 'riscos', 'próximo passo'] },
  { command: 'Transforme uma imagem/lista de startups em base de leads.', output: ['nomes normalizados', 'setor provável', 'produto provável', 'prioridade preliminar'] },
];

export const implementationMap = {
  status: 'implemented',
  completedAt: '2026-05-28',
  layers: [
    'skill tree versionada em código',
    'backlog ORIG-001 a ORIG-030 convertido em contrato operacional',
    'templates de lead/tese/abordagem/one-pager versionados',
    'playbooks de geração de leads por vertical',
    'taxonomia de sinais DCM por produto',
    'governança de evidência observado/inferido/estimado',
    'documentação em docs/origination-operating-system.md',
    'documentação canônica em docs/SRM_Origination_Skills_Fluxos_Tarefas.md',
    'endpoints serverless /api/origination/*',
  ],
  runtimeEndpoints: ['/api/origination/os', '/api/origination/skills', '/api/origination/flows', '/api/origination/backlog', '/api/origination/templates', '/api/origination/checklist', '/api/origination/execution-plan'],
};

export const getOriginationExecutionPlan = () => ({
  now: ['usar /api/origination/os como fonte do framework', 'rodar /rankings/v2 para top leads', 'executar fluxo completo para prioridades A', 'registrar ações em /tasks e /activities'],
  next: ['ligar frontend a /api/origination/os', 'popular Supabase com migration 020', 'configurar conector VC/PE dedicado', 'automatizar relatório mensal', 'persistir execuções de skills'],
  kpis: ['leads gerados/semana', 'leads qualificados/semana', 'abordagens enviadas', 'respostas', 'reuniões', 'mandatos enviados', 'mandatos assinados', 'operações fechadas'],
});

export const getOriginationOperatingSystem = () => ({
  version: ORIGINATION_OPERATING_SYSTEM_VERSION,
  thesis: 'Máquina de originação inteligente para detectar sinais precoces de necessidade de funding e transformar inteligência em conversas qualificadas para FIDC, CRI, CRA, Debênture e Debênture Incentivada.',
  principles: operatingPrinciples,
  products: originationProducts,
  structures: srmStructures,
  skills: originationSkillTree,
  priorities: priorityBuckets,
  scorecard: leadScorecard,
  scoreActions,
  pipelineStages,
  flows: operationalFlows,
  modules: operatingModules,
  routines: recurringRoutines,
  backlog: originationBacklog,
  hooks: productHooks,
  recyclingRules,
  initialVerticals,
  leadGenerationPlaybooks,
  sourceCatalogPlaybook,
  signalTaxonomy,
  checklist: leadChecklist,
  templates: originationTemplates,
  commands: commandCatalog,
  implementation: implementationMap,
});

export const getOriginationBacklog = () => originationBacklog;
export const getOriginationTemplates = () => originationTemplates;
export const getOriginationChecklist = () => leadChecklist;
