export type ApiStatus = 'real' | 'partial' | 'mock';

export type PriorityBucket = 'immediate_priority' | 'high_priority' | 'monitor_closely' | 'watchlist' | 'low_priority';

export type CompanySeed = {
  id: string;
  legalName: string;
  tradeName: string;
  cnpj: string;
  website: string;
  geography: string;
  segment: string;
  subsegment: string;
  companyType: string;
  stage: string;
  creditProduct: string;
  receivables: string[];
  currentFundingStructure: string;
  description: string;
  signals: Array<{
    type: string;
    strength: number;
    confidence: number;
    note: string;
    source: string;
  }>;
  monitoring: {
    status: string;
    lastRunAt: string;
    outputs24h: number;
    triggers24h: number;
    websiteChanges: string[];
    feedHighlights: string[];
  };
  enrichment: {
    governanceMaturity: 'low' | 'medium' | 'medium_high' | 'high';
    underwritingMaturity: 'low' | 'medium' | 'medium_high' | 'high';
    operationalMaturity: 'low' | 'medium' | 'medium_high' | 'high';
    riskModelMaturity: 'low' | 'medium' | 'medium_high' | 'high';
    unitEconomicsQuality: 'fragile' | 'mixed' | 'positive';
    spreadVsFundingQuality: 'fragile' | 'neutral' | 'healthy';
    concentrationRisk: 'low' | 'medium' | 'high';
    delinquencySignal: 'low' | 'medium' | 'high';
    sourceConfidence: number;
    sourceNotes: string[];
  };
  sourceRecords: Array<{
    sourceId: string;
    externalId: string;
    observedAt: string;
    payload: Record<string, unknown>;
  }>;
  marketMapPeers: Array<{ peerName: string; peerType: string; rationale: string }>;
  activities: Array<{ title: string; owner: string; status: string; dueDate: string }>;
};

export type SearchProfile = {
  id: string;
  name: string;
  segment: string;
  subsegment: string;
  companyType: string;
  geography: string;
  creditProduct: string;
  receivables: string[];
  targetStructure: string;
  minimumSignalIntensity: number;
  minimumConfidence: number;
  timeWindowDays: number;
  status: 'active' | 'paused';
  profilePayload: Record<string, unknown>;
};

export type SearchProfileFilter = {
  id: string;
  profileId: string;
  filterKey: string;
  filterValue: unknown;
  createdAt: string;
};

export type SourceCatalogEntry = {
  id: string;
  name: string;
  sourceType: string;
  category: string;
  status: ApiStatus | 'planned';
  health: 'healthy' | 'degraded' | 'down';
  authRequirement?: string;
  metadata: Record<string, unknown>;
  rateLimitNotes?: string;
};

export type QualificationSnapshot = {
  companyId: string;
  has_credit_product: boolean;
  credit_product_type: string;
  credit_is_core_product: boolean;
  has_receivables: boolean;
  receivables_type: string[];
  receivables_recurrence_level: string;
  receivables_predictability_level: string;
  has_fidc: boolean;
  has_securitization_structure: boolean;
  has_existing_debt_structure: boolean;
  funding_structure_type: string;
  capital_structure_quality: string;
  capital_structure_rationale: string;
  funding_gap_level: string;
  capital_dependency_level: string;
  growth_vs_funding_mismatch: string;
  fit_fidc: boolean;
  fit_dcm: boolean;
  fit_other_structure: string;
  governance_maturity_level: string;
  risk_model_maturity_level: string;
  underwriting_maturity_level: string;
  operational_maturity_level: string;
  unit_economics_quality: string;
  spread_vs_funding_quality: string;
  concentration_risk_level: string;
  delinquency_signal_level: string;
  timing_intensity_level: string;
  execution_readiness_level: string;
  qualification_score_structural: number;
  qualification_score_capital: number;
  qualification_score_receivables: number;
  qualification_score_execution: number;
  qualification_score_timing: number;
  qualification_score_total: number;
  confidence_score: number;
  rationale_summary: string;
  evidence_payload: Record<string, unknown>;
  predicted_funding_need_score: number;
  urgency_score: number;
  suggested_structure_type: string;
  source_confidence_score: number;
  trigger_strength_score: number;
  pattern_summary: string[];
  created_at: string;
};

export type PatternCatalogEntry = {
  id: string;
  patternName: string;
  patternFamily: string;
  description: string;
  explicitFeatures: string[];
  latentFeatures: string[];
  qualificationImpact: number;
  leadImpact: number;
  rankingImpact: number;
};

export type CompanyPattern = {
  id: string;
  companyId: string;
  patternId: string;
  patternName: string;
  rationale: string;
  confidenceScore: number;
  qualificationImpact: number;
  leadScoreImpact: number;
  rankingImpact: number;
  thesisImpact: string;
  evidencePayload: Record<string, unknown>;
};


export type CompanySignal = {
  id: string;
  companyId: string;
  sourceId?: string;
  signalType: string;
  signalStrength: number;
  confidenceScore: number;
  evidencePayload: Record<string, unknown>;
  observedVsInferred: 'observed' | 'inferred';
  createdAt: string;
};

export type EnrichmentRecord = {
  id: string;
  companyId: string;
  enrichmentType: string;
  provider?: string;
  payload: Record<string, unknown>;
  observedVsInferred: 'observed' | 'inferred';
  createdAt: string;
};

export type ScoreSnapshot = {
  companyId: string;
  scoreType: 'qualification' | 'funding_need' | 'urgency';
  scoreValue: number;
  rationale: string;
  version: number;
  createdAt: string;
};

export type LeadScoreSnapshot = {
  companyId: string;
  leadScore: number;
  bucket: PriorityBucket;
  rationale: string;
  nextAction: string;
  sourceConfidence: number;
  triggerStrength: number;
  patternScore: number;
  createdAt: string;
};

export type ThesisOutput = {
  summary: string;
  structureType: string;
  marketMapSummary: string;
  confidenceScore: number;
};

export type MarketMapCard = { peerName: string; peerType: string; rationale: string };

export type RankingRow = {
  position: number;
  companyId: string;
  companyName: string;
  qualificationScore: number;
  leadScore: number;
  rankingScore: number;
  bucket: PriorityBucket;
  triggerStrength: number;
  sourceConfidence: number;
  suggestedStructure: string;
  rationale: string;
};

export type MonitoringOutput = {
  id: string;
  companyId: string;
  sourceId: string;
  title: string;
  summary: string;
  collectedAt: string;
  confidenceScore: number;
  connectorStatus: ApiStatus | 'planned';
  normalizedPayload: Record<string, unknown>;
};

export type CompanyView = {
  id: string;
  name: string;
  segment: string;
  subsegment: string;
  geography: string;
  product: string;
  receivables: string[];
  qualificationScore: number;
  leadScore: number;
  leadBucket: PriorityBucket;
  monitoringStatus: string;
  suggestedStructure: string;
  thesis: string;
  nextAction: string;
  predictedFundingNeed: number;
  urgencyScore: number;
  sourceConfidence: number;
  triggerStrength: number;
  topPatterns: string[];
};

export type CompanyDetailView = {
  company: CompanyView & {
    description: string;
    currentFundingStructure: string;
    stage: string;
    cnpj: string;
    website: string;
  };
  qualification: QualificationSnapshot;
  patterns: CompanyPattern[];
  thesis: ThesisOutput;
  marketMap: MarketMapCard[];
  monitoring: CompanySeed['monitoring'];
  signals: CompanySeed['signals'];
  sources: SourceCatalogEntry[];
  activities: CompanySeed['activities'];
  scores: {
    qualification: number;
    lead: number;
    bucket: PriorityBucket;
    rankingScore: number;
  };
  scoreHistory: Array<{ at: string; qualification: number; lead: number }>;
  monitoringOutputs: MonitoringOutput[];
};

export type DashboardView = {
  summary: Array<{ label: string; value: string; tone: string; helper: string }>;
  topLeads: RankingRow[];
  monitoring: {
    activeSources: number;
    outputs24h: number;
    triggers24h: number;
    websiteChecks: number;
  };
  agents: Array<{ name: string; status: ApiStatus; lastRun: string; note: string }>;
  patterns: Array<{ pattern: string; companies: number; avgImpact: number }>;
  pipeline: Array<{ stage: string; count: number; coverage: string }>;
  charts: {
    leadBuckets: Array<{ label: string; value: number }>;
    qualificationVsLead: Array<{ company: string; qualification: number; lead: number }>;
  };
};
