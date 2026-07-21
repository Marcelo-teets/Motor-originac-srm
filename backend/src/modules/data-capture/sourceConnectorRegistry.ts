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
    id: 'src_open_finance_participants_api',
    category: 'embedded_finance',
    description: 'Official Open Finance Brasil participants directory; exact CNPJ/name matching for infrastructure roles.',
    enabledByDefault: true,
  },
  {
    id: 'src_vc_portfolio_monitor',
    category: 'vc_portfolio',
    description: 'First-party VC portfolio page monitor; confirms venture backing with evidence URLs.',
    enabledByDefault: true,
  },
  {
    id: 'src_pncp_contracts_api',
    category: 'public_procurement_receivables',
    description: 'Official PNCP contract search per supplier; primary evidence for public-debtor receivables.',
    enabledByDefault: true,
  },
  {
    id: 'src_querido_diario_api',
    category: 'regulatory',
    description: 'Querido Diário municipal gazette mentions per company (Open Knowledge Brasil API).',
    enabledByDefault: true,
  },
  {
    id: 'src_bcb_sgs',
    category: 'macro_context',
    description: 'BCB SGS macro series probe (Selic, CDI, IPCA, IGP-M, FX) feeding macro_indexer_context.',
    enabledByDefault: true,
  },
  {
    id: 'src_cvm_fidc_monthly',
    category: 'regulatory',
    description: 'CVM FIDC monthly report dataset: capital-markets ingestion (migration 035) plus per-company freshness probe.',
    enabledByDefault: true,
  },
  {
    id: 'src_cvm_fund_registry',
    category: 'regulatory',
    description: 'CVM fund registry cadastral dataset governed by the capital-markets subsystem.',
    enabledByDefault: false,
  },
  {
    id: 'src_cvm_fundos_estruturados_medidas',
    category: 'regulatory',
    description: 'CVM structured funds measures dataset (catalog visibility; heavy ingestion pending).',
    enabledByDefault: false,
  },
  {
    id: 'src_cvm_fundos_documentos_entrega',
    category: 'regulatory',
    description: 'CVM disclosure delivery metadata dataset (catalog visibility; heavy ingestion pending).',
    enabledByDefault: false,
  },
  {
    id: 'src_anbima_fundos_estruturados',
    category: 'regulatory',
    description: 'ANBIMA structured funds feed; token-gated, runtime enablement pending credentials.',
    enabledByDefault: false,
  },
  {
    id: 'src_anbima_fundos_icvm_555',
    category: 'regulatory',
    description: 'ANBIMA ICVM 555 funds feed; token-gated, runtime enablement pending credentials.',
    enabledByDefault: false,
  },
  {
    id: 'src_infosimples_cvm_participante',
    category: 'regulatory',
    description: 'Infosimples CVM participant lookup; paid token, enable explicitly.',
    enabledByDefault: false,
  },
  {
    id: 'src_portal_transparencia_api',
    category: 'public_sector',
    description: 'Portal da Transparência contracts/payments cross-check; token-gated.',
    enabledByDefault: false,
  },
];
