export const dashboardMetrics = [
  {
    id: 'leads-ativos',
    label: 'Leads ativos',
    value: 128,
    change: '+12% vs. semana anterior',
  },
  {
    id: 'propostas-em-analise',
    label: 'Propostas em análise',
    value: 42,
    change: '+5 novas hoje',
  },
  {
    id: 'taxa-conversao',
    label: 'Taxa de conversão',
    value: '36%',
    change: '+4 p.p. no mês',
  },
  {
    id: 'volume-originado',
    label: 'Volume originado',
    value: 'R$ 2,8 mi',
    change: 'Meta mensal: 78%',
  },
];

export const recentProposals = [
  {
    id: 'PROP-1042',
    client: 'Beatriz Silva',
    product: 'Capital de giro',
    value: 'R$ 180.000',
    status: 'Em análise',
  },
  {
    id: 'PROP-1041',
    client: 'Grupo Almeida',
    product: 'Antecipação',
    value: 'R$ 90.000',
    status: 'Documentação pendente',
  },
  {
    id: 'PROP-1040',
    client: 'Mercado Nova Era',
    product: 'Financiamento',
    value: 'R$ 320.000',
    status: 'Aprovada',
  },
];

export const clients = [
  {
    id: 1,
    name: 'Beatriz Silva',
    document: '123.456.789-10',
    city: 'São Paulo/SP',
    segment: 'Pessoa Física',
    status: 'Em negociação',
  },
  {
    id: 2,
    name: 'Grupo Almeida',
    document: '12.345.678/0001-10',
    city: 'Curitiba/PR',
    segment: 'PME',
    status: 'Pré-análise',
  },
  {
    id: 3,
    name: 'Mercado Nova Era',
    document: '67.890.123/0001-44',
    city: 'Belo Horizonte/MG',
    segment: 'Varejo',
    status: 'Aprovado',
  },
  {
    id: 4,
    name: 'Patrícia Lima',
    document: '987.654.321-00',
    city: 'Recife/PE',
    segment: 'Pessoa Física',
    status: 'Pendente',
  },
];

export const pipelineColumns = [
  {
    id: 'captacao',
    title: 'Captação',
    items: [
      { id: 'lead-1', client: 'Carlos Mendes', value: 'R$ 70.000', owner: 'Ana' },
      { id: 'lead-2', client: 'Super Loja Sul', value: 'R$ 210.000', owner: 'Rafael' },
    ],
  },
  {
    id: 'analise',
    title: 'Análise',
    items: [
      { id: 'lead-3', client: 'Beatriz Silva', value: 'R$ 180.000', owner: 'Juliana' },
      { id: 'lead-4', client: 'Patrícia Lima', value: 'R$ 55.000', owner: 'Ana' },
    ],
  },
  {
    id: 'aprovacao',
    title: 'Aprovação',
    items: [
      { id: 'lead-5', client: 'Mercado Nova Era', value: 'R$ 320.000', owner: 'Rafael' },
    ],
  },
  {
    id: 'formalizacao',
    title: 'Formalização',
    items: [
      { id: 'lead-6', client: 'Grupo Almeida', value: 'R$ 90.000', owner: 'Juliana' },
    ],
  },
];

export const proposalDefaults = {
  clientName: '',
  document: '',
  product: 'Capital de giro',
  amount: '',
  term: '12',
  email: '',
  phone: '',
  notes: '',
};
