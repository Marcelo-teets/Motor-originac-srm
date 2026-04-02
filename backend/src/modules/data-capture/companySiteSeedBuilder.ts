import type { CompanySeed } from '../../types/platform.js';
import { buildCompanyCrawlPlan } from './crawlPlanBuilder.js';

export const buildCompanySiteSeed = (company: CompanySeed) => ({
  companyId: company.id,
  website: company.website,
  crawlTargets: buildCompanyCrawlPlan(company),
  primaryTerms: [company.tradeName, company.legalName, company.creditProduct, ...(company.receivables ?? [])].filter(Boolean),
});
