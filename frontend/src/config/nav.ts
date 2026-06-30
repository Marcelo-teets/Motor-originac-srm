export type NavItem = {
  readonly to: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
};

export const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    shortLabel: 'Cockpit executivo',
    description: 'KPIs, top leads e fila de decisão para originação.',
  },
  {
    to: '/search-profiles',
    label: 'Search Profiles',
    shortLabel: 'Perfis de busca',
    description: 'Universos, teses e filtros de descoberta de empresas.',
  },
  {
    to: '/companies',
    label: 'Leads',
    shortLabel: 'Leads priorizados',
    description: 'Ranking operacional por score, timing, estrutura e próxima ação.',
  },
  {
    to: '/watch-lists',
    label: 'Watch Lists',
    shortLabel: 'Watchlist',
    description: 'Empresas monitoradas de perto pelo time comercial.',
  },
  {
    to: '/monitoring',
    label: 'Monitoring Center',
    shortLabel: 'Monitoramento',
    description: 'Outputs, sinais e mudanças capturadas pelas fontes.',
  },
  {
    to: '/sources',
    label: 'Sources',
    shortLabel: 'Fontes',
    description: 'Catálogo, governança e saúde das fontes de dados.',
  },
  {
    to: '/agents',
    label: 'Agents Control',
    shortLabel: 'Agentes',
    description: 'Execução, diagnóstico e confiança dos agentes operacionais.',
  },
  {
    to: '/capture-inbox',
    label: 'Capture Inbox',
    shortLabel: 'Inbox discovery',
    description: 'Runs de discovery, candidatos capturados e promoção para o motor principal.',
  },
  {
    to: '/origination-os',
    label: 'Origination OS',
    shortLabel: 'Sistema operacional',
    description: 'Skills, scorecard, templates, checklist e backlog de originação.',
  },
  {
    to: '/pipeline',
    label: 'Pipeline / Activities',
    shortLabel: 'Pipeline',
    description: 'CRM de originação, atividades, tarefas e próximos passos comerciais.',
  },
] satisfies readonly NavItem[];
