export type SourceConnectorDefinition = {
  id: string;
  name: string;
  connectorType: 'api' | 'rss' | 'website' | 'scraper';
  baseUrl: string;
  authMode: 'none' | 'apikey' | 'oauth' | 'cookie';
  cadence: string;
  categories: string[];
  parserStrategy: 'json' | 'rss' | 'html' | 'mixed';
  extractionMode: 'api' | 'feed' | 'crawl';
  rationale: string;
};

export type SourceEndpointDefinition = {
  id: string;
  connectorId: string;
  name: string;
  category: string;
  endpointUrl: string;
  sectorHint?: string;
  parserStrategy: 'json' | 'rss' | 'html' | 'mixed';
  extractionMode: 'api' | 'feed' | 'crawl';
  matchingHints: string[];
};

export const sourceConnectors: SourceConnectorDefinition[] = [
  {
    id: 'brasilapi-cnpj',
    name: 'BrasilAPI CNPJ',
    connectorType: 'api',
    baseUrl: 'https://brasilapi.com.br',
    authMode: 'none',
    cadence: 'on-demand + refresh',
    categories: ['company_registry', 'legal'],
    parserStrategy: 'json',
    extractionMode: 'api',
    rationale: 'Base pública e simples para dados cadastrais e de CNPJ.',
  },
  {
    id: 'rss-general-news',
    name: 'RSS General News',
    connectorType: 'rss',
    baseUrl: 'multi-source',
    authMode: 'none',
    cadence: 'hourly',
    categories: ['news', 'funding', 'expansion'],
    parserStrategy: 'rss',
    extractionMode: 'feed',
    rationale: 'Capturar notícias recorrentes sobre funding, expansão, layoffs, M&A e produto.',
  },
  {
    id: 'company-websites',
    name: 'Company Websites',
    connectorType: 'website',
    baseUrl: 'company-domain',
    authMode: 'none',
    cadence: 'daily',
    categories: ['product', 'receivables', 'credit', 'about'],
    parserStrategy: 'html',
    extractionMode: 'crawl',
    rationale: 'Extrair sinais explícitos e implícitos diretamente da narrativa institucional da empresa.',
  },
  {
    id: 'openstartups-ranking',
    name: 'Open Startups Ranking',
    connectorType: 'website',
    baseUrl: 'https://openstartups.net',
    authMode: 'none',
    cadence: 'weekly',
    categories: ['ecosystem', 'ranking', 'startup'],
    parserStrategy: 'html',
    extractionMode: 'crawl',
    rationale: 'Usar ranking e presença no ecossistema como insumo de discovery e priorização.',
  },
  {
    id: 'painel-fidc-datasets',
    name: 'Painel FIDC Datasets',
    connectorType: 'scraper',
    baseUrl: 'https://www.painelfidc.com.br',
    authMode: 'cookie',
    cadence: 'weekly',
    categories: ['fidc', 'market', 'funding_structure'],
    parserStrategy: 'mixed',
    extractionMode: 'crawl',
    rationale: 'Apoiar a leitura de mercado e benchmark estrutural de FIDC.',
  },
];

export const sourceEndpoints: SourceEndpointDefinition[] = [
  {
    id: 'brasilapi-cnpj-v1',
    connectorId: 'brasilapi-cnpj',
    name: 'BrasilAPI CNPJ Lookup',
    category: 'company_registry',
    endpointUrl: 'https://brasilapi.com.br/api/cnpj/v1/{cnpj}',
    parserStrategy: 'json',
    extractionMode: 'api',
    matchingHints: ['cnpj', 'razao social', 'nome fantasia', 'cnae principal'],
  },
  {
    id: 'rss-neofeed',
    connectorId: 'rss-general-news',
    name: 'NeoFeed RSS',
    category: 'news',
    endpointUrl: 'https://neofeed.com.br/feed/',
    parserStrategy: 'rss',
    extractionMode: 'feed',
    matchingHints: ['funding', 'aquisição', 'receita', 'crédito'],
  },
  {
    id: 'rss-startupi',
    connectorId: 'rss-general-news',
    name: 'Startupi RSS',
    category: 'startup_news',
    endpointUrl: 'https://startupi.com.br/feed/',
    parserStrategy: 'rss',
    extractionMode: 'feed',
    matchingHints: ['rodada', 'crescimento', 'fintech', 'embedded finance'],
  },
  {
    id: 'company-homepage',
    connectorId: 'company-websites',
    name: 'Company Homepage Crawl',
    category: 'product',
    endpointUrl: '{company_domain}',
    parserStrategy: 'html',
    extractionMode: 'crawl',
    matchingHints: ['crédito', 'antecipação', 'parcelado', 'recebíveis', 'fidc'],
  },
  {
    id: 'company-blog',
    connectorId: 'company-websites',
    name: 'Company Blog Crawl',
    category: 'newsroom',
    endpointUrl: '{company_domain}/blog',
    parserStrategy: 'html',
    extractionMode: 'crawl',
    matchingHints: ['lançamento', 'parceria', 'expansão', 'funding'],
  },
  {
    id: 'openstartups-ranking-page',
    connectorId: 'openstartups-ranking',
    name: 'Open Startups Ranking Page',
    category: 'ranking',
    endpointUrl: 'https://openstartups.net/site/ranking.html',
    parserStrategy: 'html',
    extractionMode: 'crawl',
    matchingHints: ['startup name', 'ranking', 'categoria'],
  },
  {
    id: 'painel-fidc-dataset-page',
    connectorId: 'painel-fidc-datasets',
    name: 'Painel FIDC Dataset Page',
    category: 'fidc_market',
    endpointUrl: 'https://www.painelfidc.com.br/dataset-fidc',
    parserStrategy: 'mixed',
    extractionMode: 'crawl',
    matchingHints: ['fidc', 'administrador', 'segmento predominante'],
  },
];
