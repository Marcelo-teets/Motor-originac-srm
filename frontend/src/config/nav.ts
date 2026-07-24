export type NavGroup = 'Radar' | 'Execução comercial' | 'Operação & governança';

export type NavItem = {
  readonly to: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly group: NavGroup;
  readonly godOnly?: boolean;
};

export const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    shortLabel: 'Cockpit executivo',
    description: 'KPIs, top leads e fila de decisão para originação.',
    group: 'Radar',
  },
  {
    to: '/search-profiles',
    label: 'Search Profiles',
    shortLabel: 'Perfis de busca',
    description: 'Universos, teses e filtros de descoberta de empresas.',
    group: 'Radar',
  },
  {
    to: '/companies',
    label: 'Leads',
    shortLabel: 'Leads priorizados',
    description: 'Ranking operacional por score, timing, estrutura e próxima ação.',
    group: 'Radar',
  },
  {
    to: '/market-map',
    label: 'Market Map FIDC',
    shortLabel: 'Comparáveis FIDC',
    description: 'Fundos comparáveis por PL, carteira, inadimplência, subordinação e qualidade operacional.',
    group: 'Radar',
  },
  {
    to: '/watch-lists',
    label: 'Watch Lists',
    shortLabel: 'Watchlist',
    description: 'Empresas monitoradas de perto pelo time comercial.',
    group: 'Radar',
  },
  {
    to: '/pipeline',
    label: 'Pipeline / Activities',
    shortLabel: 'Pipeline',
    description: 'CRM de originação, atividades, tarefas e próximos passos comerciais.',
    group: 'Execução comercial',
  },
  {
    to: '/knowledge-vault',
    label: 'Knowledge Vault',
    shortLabel: 'Memória conectada',
    description: 'Notas, teses, sinais, reuniões, WikiLinks, backlinks e grafo de originação.',
    group: 'Execução comercial',
  },
  {
    to: '/knowledge-search',
    label: 'Busca do Vault',
    shortLabel: 'Busca híbrida',
    description: 'Recuperação lexical e semântica de evidências com lineage e filtro por empresa.',
    group: 'Execução comercial',
  },
  {
    to: '/outcome-operations',
    label: 'Outcome Workbench',
    shortLabel: 'Fila diária de resultados',
    description: 'Prioridade explicável, captura guiada de outcomes e atualização auditável do pipeline.',
    group: 'Execução comercial',
  },
  {
    to: '/origination-os',
    label: 'Origination OS',
    shortLabel: 'Sistema operacional',
    description: 'Skills, scorecard, templates, checklist e backlog de originação.',
    group: 'Execução comercial',
  },
  {
    to: '/monitoring',
    label: 'Monitoring Center',
    shortLabel: 'Monitoramento',
    description: 'Outputs, sinais e mudanças capturadas pelas fontes.',
    group: 'Operação & governança',
  },
  {
    to: '/capture-inbox',
    label: 'Capture Inbox',
    shortLabel: 'Candidatas descobertas',
    description: 'Runs de descoberta e candidatas aguardando promoção para lead.',
    group: 'Operação & governança',
  },
  {
    to: '/identity-review',
    label: 'Identity Review',
    shortLabel: 'CNPJ e entidade',
    description: 'Triagem GOD-MODE de entidade, CNPJ, evidência e entrada monitorável no Company Master.',
    group: 'Operação & governança',
    godOnly: true,
  },
  {
    to: '/sources',
    label: 'Sources',
    shortLabel: 'Fontes',
    description: 'Catálogo, governança e saúde das fontes de dados.',
    group: 'Operação & governança',
  },
  {
    to: '/agents',
    label: 'Agents Control',
    shortLabel: 'Agentes',
    description: 'Execução, diagnóstico e confiança dos agentes operacionais.',
    group: 'Operação & governança',
  },
  {
    to: '/profile',
    label: 'Meu perfil',
    shortLabel: 'Conta e preferências',
    description: 'Dados do usuário, nível de acesso e configurações da conta.',
    group: 'Operação & governança',
  },
  {
    to: '/users',
    label: 'Usuários',
    shortLabel: 'Acessos da plataforma',
    description: 'Gestão GOD-MODE dos usuários comuns e seus status de acesso.',
    group: 'Operação & governança',
    godOnly: true,
  },
] satisfies readonly NavItem[];

export const navGroups: readonly NavGroup[] = ['Radar', 'Execução comercial', 'Operação & governança'];
