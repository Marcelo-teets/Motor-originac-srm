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
    label: 'Hoje',
    shortLabel: 'Prioridades do dia',
    description: 'Próxima melhor ação, fila prioritária e bloqueios que exigem decisão.',
    group: 'Radar',
  },
  {
    to: '/companies',
    label: 'Leads',
    shortLabel: 'Quem abordar',
    description: 'Empresas priorizadas por timing, tese financeira, evidência e próxima ação.',
    group: 'Radar',
  },
  {
    to: '/pipeline',
    label: 'Pipeline',
    shortLabel: 'Oportunidades em execução',
    description: 'Acompanhe estágio, responsável, bloqueios e próximo passo comercial.',
    group: 'Execução comercial',
  },
  {
    to: '/search-profiles',
    label: 'Pesquisar',
    shortLabel: 'Descreva o que procura',
    description: 'Busque novas empresas em linguagem normal. O motor cuida dos critérios técnicos e devolve candidatas para revisão.',
    group: 'Radar',
  },
  {
    to: '/dcm-daily',
    label: 'Abordagens',
    shortLabel: 'Fila diária DCM',
    description: 'Prepare mensagens e execute os contatos prioritários do dia.',
    group: 'Execução comercial',
  },
  {
    to: '/task-center',
    label: 'Tarefas',
    shortLabel: 'Planner + To Do',
    description: 'Organize atividades pessoais e compartilhadas sem sair do fluxo de originação.',
    group: 'Execução comercial',
  },
  {
    to: '/watch-lists',
    label: 'Watchlist',
    shortLabel: 'Empresas acompanhadas',
    description: 'Monitore de perto contas que ainda não estão prontas para abordagem.',
    group: 'Radar',
  },
  {
    to: '/market-map',
    label: 'Market Map FIDC',
    shortLabel: 'Comparáveis e estruturas',
    description: 'Consulte fundos comparáveis e referências para sustentar a tese de estrutura.',
    group: 'Radar',
  },
  {
    to: '/monitoring',
    label: 'Sinais',
    shortLabel: 'O que mudou',
    description: 'Revise mudanças capturadas pelas fontes e o impacto sobre timing e score.',
    group: 'Operação & governança',
  },
  {
    to: '/outcome-operations',
    label: 'Resultados',
    shortLabel: 'Aprendizado comercial',
    description: 'Registre outcomes e atualize o aprendizado institucional da originação.',
    group: 'Execução comercial',
  },
  {
    to: '/knowledge-vault',
    label: 'Conhecimento',
    shortLabel: 'Memória conectada',
    description: 'Acesse notas, teses, reuniões, evidências e relações entre empresas.',
    group: 'Execução comercial',
  },
  {
    to: '/knowledge-search',
    label: 'Buscar conhecimento',
    shortLabel: 'Busca híbrida',
    description: 'Recupere evidências e contexto por empresa, tema ou estrutura financeira.',
    group: 'Execução comercial',
  },
  {
    to: '/knowledge-learning',
    label: 'Aprendizado da IA',
    shortLabel: 'Mind maps e auditoria',
    description: 'Acompanhe o agente que organiza e atualiza a memória do sistema.',
    group: 'Execução comercial',
  },
  {
    to: '/origination-os',
    label: 'Playbooks',
    shortLabel: 'Origination OS',
    description: 'Consulte skills, templates, checklists e padrões operacionais.',
    group: 'Execução comercial',
  },
  {
    to: '/mission-control',
    label: 'Mission Control',
    shortLabel: 'Controle da missão',
    description: 'Acompanhe features, módulos, filas de desenvolvimento, bloqueios, maturidade e GitHub ao vivo.',
    group: 'Operação & governança',
  },
  {
    to: '/capture-inbox',
    label: 'Capturas',
    shortLabel: 'Candidatas descobertas',
    description: 'Revise empresas capturadas antes da promoção para o Company Master.',
    group: 'Operação & governança',
  },
  {
    to: '/identity-review',
    label: 'Identidades',
    shortLabel: 'CNPJ e entidade',
    description: 'Valide razão social, CNPJ, domínio e evidências de identidade.',
    group: 'Operação & governança',
  },
  {
    to: '/credit-review',
    label: 'Revisão de crédito',
    shortLabel: 'Gate de qualificação',
    description: 'Valide produto de crédito, recebíveis, funding e executabilidade.',
    group: 'Operação & governança',
    godOnly: true,
  },
  {
    to: '/sources',
    label: 'Fontes',
    shortLabel: 'Catálogo e saúde',
    description: 'Administre o catálogo, a governança e a disponibilidade das fontes.',
    group: 'Operação & governança',
  },
  {
    to: '/agents',
    label: 'Agentes',
    shortLabel: 'Controle operacional',
    description: 'Acompanhe execução, diagnóstico e confiança dos agentes.',
    group: 'Operação & governança',
  },
  {
    to: '/historical-archive',
    label: 'Arquivo histórico',
    shortLabel: 'Retenção externa',
    description: 'Consulte arquivos históricos e a estratégia de proteção do Supabase.',
    group: 'Operação & governança',
    godOnly: true,
  },
  {
    to: '/profile',
    label: 'Meu perfil',
    shortLabel: 'Conta e preferências',
    description: 'Gerencie dados do usuário, acesso e configurações da conta.',
    group: 'Operação & governança',
  },
  {
    to: '/users',
    label: 'Usuários',
    shortLabel: 'Acessos da plataforma',
    description: 'Administre usuários comuns e privilégios GOD-MODE.',
    group: 'Operação & governança',
    godOnly: true,
  },
] satisfies readonly NavItem[];

export const navGroups: readonly NavGroup[] = ['Radar', 'Execução comercial', 'Operação & governança'];
