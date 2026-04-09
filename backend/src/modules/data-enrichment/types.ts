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

export type OutputLifecycleState = 'active' | 'review' | 'stale' | 'forgotten' | 'archived';

export type RecaptureTask = {
  outputId: string;
  sourceId: string;
  priority: 'urgent' | 'high' | 'normal';
  reason: string;
};

export type EnrichmentRunOutput = {
  companyId: string;
  aliases: AliasRecord[];
  requestsCreated: number;
  outputsConsidered: number;
  staleOutputs: number;
  forgottenOutputs: number;
  qualityScore: number;
  sourceCoverage: number;
  lifecycleCounts: Record<OutputLifecycleState, number>;
  recaptureQueue: RecaptureTask[];
  inferredThemes: string[];
  recapturePressure: number;
  healthAlerts: string[];
};
