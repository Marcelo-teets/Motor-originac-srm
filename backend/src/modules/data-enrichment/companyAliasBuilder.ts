import type { CompanySeed } from '../../types/platform.js';

const normalizeDomain = (website: string) => website.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();

export const buildCompanyAliases = (company: CompanySeed) => {
  const aliases = [
    { aliasType: 'legal_name', aliasValue: company.legalName, confidenceScore: 0.95 },
    { aliasType: 'trade_name', aliasValue: company.tradeName, confidenceScore: 0.92 },
    { aliasType: 'domain', aliasValue: normalizeDomain(company.website), confidenceScore: 0.9 },
    { aliasType: 'cnpj', aliasValue: company.cnpj.replace(/\D/g, ''), confidenceScore: 0.99 },
  ];

  return aliases.filter((item, index, array) => array.findIndex((candidate) => candidate.aliasType === item.aliasType && candidate.aliasValue === item.aliasValue) === index);
};
