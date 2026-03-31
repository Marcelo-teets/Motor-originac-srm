import type { CompanySeed, MonitoringOutput } from '../../types/platform.js';
import type { EnrichmentRunInput, EnrichmentRunOutput, AliasRecord } from './types.js';

const buildAliases = (company: CompanySeed): AliasRecord[] => {
  const aliases: AliasRecord[] = [];
  if (company.legalName) aliases.push({ companyId: company.id, aliasType: 'legal_name', aliasValue: company.legalName, confidenceScore: 0.95 });
  if (company.tradeName) aliases.push({ companyId: company.id, aliasType: 'trade_name', aliasValue: company.tradeName, confidenceScore: 0.92 });
  if (company.website) aliases.push({ companyId: company.id, aliasType: 'domain', aliasValue: company.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), confidenceScore: 0.88 });
  return aliases;
};

export class DataTreatmentEngine {
  run(input: EnrichmentRunInput, companies: CompanySeed[], monitoringOutputs: MonitoringOutput[]): EnrichmentRunOutput[] {
    const targets = input.companyId ? companies.filter((item) => item.id === input.companyId) : companies;

    return targets.map((company) => ({
      companyId: company.id,
      aliases: buildAliases(company),
      requestsCreated: monitoringOutputs.filter((item) => item.companyId === company.id && item.confidenceScore < 0.65).length,
    }));
  }
}
