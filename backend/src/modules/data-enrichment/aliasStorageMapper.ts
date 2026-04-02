export const mapAliasForStorage = (companyId: string, alias: { aliasType: string; aliasValue: string; confidenceScore: number; sourceId?: string }) => ({
  company_id: companyId,
  alias_type: alias.aliasType,
  alias_value: alias.aliasValue,
  source_id: alias.sourceId ?? null,
  confidence_score: alias.confidenceScore,
});

export const mapAliasesForStorage = (companyId: string, aliases: Array<{ aliasType: string; aliasValue: string; confidenceScore: number; sourceId?: string }>) =>
  aliases.map((alias) => mapAliasForStorage(companyId, alias));
