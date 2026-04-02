import type { CompanySeed, MonitoringOutput } from '../../types/platform.js';
import type { EnrichmentRunInput, EnrichmentRunOutput, AliasRecord } from './types.js';
import { buildCompanyAliases } from './companyAliasBuilder.js';

const buildAliases = (company: CompanySeed): AliasRecord[] =>
  buildCompanyAliases(company).map((alias) => ({
    companyId: company.id,
    aliasType: alias.aliasType as AliasRecord['aliasType'],
    aliasValue: alias.aliasValue,
    confidenceScore: alias.confidenceScore,
  }));

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
