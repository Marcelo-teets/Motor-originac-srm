import { companySeeds, searchProfileSeeds, sourceCatalogSeeds } from './platformSeeds.js';

export const companies = companySeeds.map((company) => ({
  id: company.id,
  name: company.tradeName,
  segment: company.segment,
  subsegment: company.subsegment,
  geography: company.geography,
  product: company.creditProduct,
  receivables: company.receivables,
  qualificationScore: 0,
  leadScore: 0,
  leadBucket: 'watchlist',
  monitoringStatus: company.monitoring.status,
  suggestedStructure: company.currentFundingStructure,
  thesis: company.description,
  nextAction: company.activities[0]?.title ?? 'Executar análise',
}));

export const searchProfiles = searchProfileSeeds;
export const sources = sourceCatalogSeeds;
export const dashboardSummary = { monitoredCompanies: companies.length };
export const pipeline = [];
export const activities = [];
export const tasks = [];
export const companyDetails = {};
export const statusMatrix = {};
export const agentPayload = { definitions: [], runs: [] };
