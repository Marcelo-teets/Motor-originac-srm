export type NavGroup = 'Radar' | 'Execução comercial' | 'Operação & governança';

export type NavItem = {
  readonly to: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly group: NavGroup;
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
] satisfies readonly NavItem[];

export const navGroups: readonly NavGroup[] = ['Radar', 'Execução comercial', 'Operação & governança'];
