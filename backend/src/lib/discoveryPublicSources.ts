export type DiscoveryPublicSource = {
  id: string;
  name: string;
  sourceType: 'rss' | 'website' | 'api';
  priority: number;
  baseUrl: string;
  coverage: Array<'startup' | 'fintech' | 'saas' | 'credit' | 'funding' | 'receivables' | 'fidc'>;
  notes: string;
};

export const discoveryPublicSources: DiscoveryPublicSource[] = [
  {
    id: 'google-news-rss',
    name: 'Google News RSS Search',
    sourceType: 'rss',
    priority: 1,
    baseUrl: 'https://news.google.com/rss/search',
    coverage: ['startup', 'fintech', 'funding', 'credit'],
    notes: 'Busca rápida por notícias recentes de funding, expansão, crédito e capital.',
  },
  {
    id: 'startupi-rss',
    name: 'Startupi RSS',
    sourceType: 'rss',
    priority: 2,
    baseUrl: 'https://startupi.com.br/feed/',
    coverage: ['startup', 'fintech', 'funding'],
    notes: 'Fonte frequente de rodadas, expansão e movimentos de startups no Brasil.',
  },
  {
    id: 'neofeed-rss',
    name: 'NeoFeed RSS',
    sourceType: 'rss',
    priority: 3,
    baseUrl: 'https://neofeed.com.br/feed/',
    coverage: ['startup', 'fintech', 'funding', 'credit'],
    notes: 'Fonte útil para funding, M&A, expansão e teses de capital.',
  },
  {
    id: 'openstartups-ranking',
    name: 'Open Startups Ranking',
    sourceType: 'website',
    priority: 4,
    baseUrl: 'https://openstartups.net/site/ranking.html',
    coverage: ['startup', 'fintech', 'saas'],
    notes: 'Apoia discovery por presença em ranking e densidade de ecossistema.',
  },
  {
    id: 'painel-fidc-dataset',
    name: 'Painel FIDC Dataset',
    sourceType: 'website',
    priority: 5,
    baseUrl: 'https://www.painelfidc.com.br/dataset-fidc',
    coverage: ['fidc', 'receivables', 'credit'],
    notes: 'Referência de benchmark estrutural e leitura de mercado para originação.',
  },
];
