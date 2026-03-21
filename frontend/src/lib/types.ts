export type ApiEnvelope<T> = {
  status: 'real' | 'partial' | 'mock';
  generatedAt?: string;
  data: T;
  error?: string;
};

export type DataSourceKind = 'real' | 'partial' | 'mock';

export type DataState<T> = {
  data: T;
  source: DataSourceKind;
  note: string;
};

export type Dashboard = {
  summary: Array<{ label: string; value: string; tone: string; helper: string }>;
  topLeads: Array<{ companyId: string; companyName: string; qualificationScore: number; leadScore: number; triggerStrength: number; suggestedStructure: string; bucket: string; rankingScore?: number }>;
  monitoring: { activeSources: number; outputs24h: number; triggers24h: number; websiteChecks: number };
  agents: Array<{ name: string; status: string; lastRun: string; note: string }>;
  patterns: Array<{ pattern: string; companies: number; avgImpact: number }>;
  pipeline: Array<{ stage: string; count: number; coverage: string }>;
  charts: {
    leadBuckets?: Array<{ label: string; value: number }>;
    qualificationVsLead: Array<{ company: string; qualification: number; lead: number }>;
  };
};

export type CompanyListItem = {
  id: string;
  name: string;
  segment: string;
  subsegment: string;
  geography?: string;
  product?: string;
  receivables?: string[];
  suggestedStructure: string;
  qualificationScore: number;
  leadScore: number;
  predictedFundingNeed: number;
  urgencyScore?: number;
  leadBucket: string;
  monitoringStatus?: string;
  triggerStrength: number;
  sourceConfidence: number;
  topPatterns: string[];
  thesis?: string;
  nextAction?: string;
};

export type CompanyDetail = {
  company: CompanyListItem & {
    description: string;
    currentFundingStructure: string;
    stage: string;
    cnpj: string;
    website: string;
    geography: string;
    product: string;
    receivables: string[];
    thesis: string;
    nextAction: string;
    urgencyScore: number;
  };
  qualification: Record<string, unknown> & {
    qualification_score_total: number;
    predicted_funding_need_score: number;
    urgency_score: number;
    source_confidence_score: number;
    suggested_structure_type: string;
    capital_structure_rationale: string;
    pattern_summary: string[];
    funding_gap_level?: string;
    fit_fidc?: boolean;
    fit_dcm?: boolean;
    governance_maturity_level?: string;
    execution_readiness_level?: string;
    capital_dependency_level?: string;
    timing_intensity_level?: string;
    qualification_score_capital?: number;
    qualification_score_receivables?: number;
    qualification_score_execution?: number;
    qualification_score_timing?: number;
  };
  patterns: Array<{ id: string; patternName: string; rationale: string; confidenceScore: number; leadScoreImpact: number; rankingImpact: number; thesisImpact?: string }>;
  thesis: { summary: string; structureType: string; marketMapSummary: string; confidenceScore: number };
  marketMap: Array<{ peerName: string; peerType: string; rationale: string }>;
  monitoring: { status: string; lastRunAt: string; outputs24h: number; triggers24h: number; websiteChanges: string[]; feedHighlights: string[] };
  signals: Array<{ type: string; strength: number; confidence: number; note: string; source: string }>;
  sources: Array<{ id: string; name: string; status: string; health: string; category: string }>;
  activities: Array<{ title: string; owner: string; status: string; dueDate: string }>;
  scores: { qualification: number; lead: number; bucket: string; rankingScore: number };
  scoreHistory: Array<{ at: string; qualification: number; lead: number }>;
  monitoringOutputs: Array<{ id: string; sourceId: string; title: string; summary: string; confidenceScore: number; connectorStatus: string; collectedAt: string }>;
};

export type SourceEntry = { id: string; name: string; sourceType: string; category: string; status: string; health: string };
export type SessionData = { access_token: string; refresh_token?: string; expires_at: number; user: { id: string; email?: string; role?: string } };

export type SearchProfileDraft = {
  segment: string;
  subsegment: string;
  companyType: string;
  geography: string;
  creditProduct: string;
  receivables: string;
  targetStructure: string;
  signalIntensity: string;
  minimumConfidence: string;
  timeWindow: string;
};

export type MonitoringSnapshot = {
  recentTriggers: Array<{ company: string; signal: string; source: string; strength: number; when: string }>;
  latestRuns: Array<{ workflow: string; status: string; detail: string; when: string }>;
  activeSources: Array<{ name: string; status: string; health: string; coverage: string }>;
};

export type AgentsSnapshot = {
  items: Array<{ name: string; status: string; failures: number; confidence: number; focus: string; updatedAt: string }>;
};

export type PipelineSnapshot = {
  stages: Array<{ stage: string; count: number; note: string }>;
  recentActivities: Array<{ company: string; title: string; owner: string; when: string; status: string }>;
};
