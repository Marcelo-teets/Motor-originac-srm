export type AliasRecord = {
  companyId: string;
  aliasType: 'legal_name' | 'trade_name' | 'domain';
  aliasValue: string;
  confidenceScore: number;
};

export type EnrichmentRunInput = {
  companyId?: string;
  reason: 'manual' | 'scheduled' | 'orchestrated';
};

export type EnrichmentRunOutput = {
  companyId: string;
  aliases: AliasRecord[];
  requestsCreated: number;
};
