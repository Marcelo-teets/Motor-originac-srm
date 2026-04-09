export type RegisteredSourceConnector = {
  id: string;
  category: string;
  description: string;
  enabledByDefault: boolean;
};

export const sourceConnectorRegistry: RegisteredSourceConnector[] = [
  {
    id: 'src_company_website',
    category: 'company_site',
    description: 'Primary website monitoring for product, positioning and receivables/funding hints.',
    enabledByDefault: true,
  },
  {
    id: 'src_company_website_deep',
    category: 'company_site',
    description: 'Deep crawl of B2B company pages to detect enterprise, credit and receivables signals.',
    enabledByDefault: true,
  },
  {
    id: 'src_professional_network_company',
    category: 'social_signal',
    description: 'Public institutional profile monitoring for B2B positioning, hiring and growth signals.',
    enabledByDefault: true,
  },
  {
    id: 'src_google_news_rss',
    category: 'news_traditional',
    description: 'Google News RSS search for company name and funding signals.',
    enabledByDefault: true,
  },
  {
    id: 'src_brasilapi_cnpj',
    category: 'regulatory',
    description: 'Official-ish public cadastral enrichment via BrasilAPI.',
    enabledByDefault: true,
  },
  {
    id: 'src_cvm_rss',
    category: 'regulatory',
    description: 'CVM news / regulatory monitoring.',
    enabledByDefault: true,
  },
];
