import type { CompanySeed } from '../../types/platform.js';

export const buildCompanySourcePlan = (company: CompanySeed) => ({
  companyId: company.id,
  sourceIds: ['src_company_website', 'src_google_news_rss', 'src_brasilapi_cnpj', 'src_cvm_rss', 'src_vc_portfolio_scan'],
  searchTerms: [company.tradeName, company.legalName, company.creditProduct, company.segment, company.subsegment].filter(Boolean),
});
