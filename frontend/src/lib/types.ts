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

export type PipelineStage = 'Identified' | 'Qualified' | 'Approach' | 'Structuring' | 'Mandated' | 'ClosedWon' | 'ClosedLost' | 'Recycled';
export type ActivityType = 'follow_up' | 'meeting' | 'email' | 'call' | 'research' | 'committee' | 'other';
export type ActivityStatus = 'open' | 'done' | 'cancelled';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
export type Owner = 'Origination' | 'Coverage' | 'Analytics' | 'Intelligence' | 'Credit' | 'Unknown';

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
    capital_structure_quality?: string;
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



export type AbmStakeholder = {
  id: string;
  company_id: string;
  name: string;
  title?: string;
  role_in_buying_committee?: string;
  champion_score: number;
  blocker_score: number;
  influence_score: number;
  relationship_strength: number;
  what_they_care_about?: string;
  known_objections?: string;
  last_contact_at?: string;
};

export type AbmTouchpoint = {
  id: string;
  company_id: string;
  channel: string;
  direction?: string;
  occurred_at: string;
  summary: string;
  sentiment?: string;
  objection_raised: boolean;
  agreed_next_step?: string;
  next_step_due_at?: string;
};

export type AbmObjection = {
  id: string;
  company_id: string;
  objection_text: string;
  status: string;
  severity?: string;
  resolution_notes?: string;
};

export type AbmWeeklyWarRoom = {
  top_accounts: Array<{ company_id: string; company_name: string; priority_band: string; priority_score?: number; momentum_status: string; momentum_score?: number }>;
  cooling_accounts: Array<{ company_id: string; company_name: string }>;
  without_champion: Array<{ company_id: string; company_name: string }>;
  overdue_next_steps: Array<{ company_id: string; company_name: string; next_step_due_at: string }>;
  critical_open_objections: Array<{ company_id: string; objection_text: string; severity?: string }>;
};

export type PreCallBriefing = {
  companyId: string;
  institutional_summary: string;
  thesis: string;
  why_now: string;
  recent_signals: Array<{ type: string; strength: number; observed_at: string }>;
  stakeholders: AbmStakeholder[];
  recent_touchpoints: AbmTouchpoint[];
  open_objections: AbmObjection[];
  recommended_next_step: string;
  conversation_risks: string[];
  suggested_cta: string;
};

export type PreMortem = {
  companyId: string;
  risks: Array<{ risk: string; evidence: string; mitigation: string }>;
};


export type MvpQuickAction = {
  id: string;
  title: string;
  owner: string;
  priority: 'high' | 'medium' | 'low';
};

export type MvpQuickActionsSnapshot = {
  items: MvpQuickAction[];
};
export type MvpReadiness = {
  auth: { status: string; provider: string };
  database: { status: string; mode: string };
  sources: { total: number; degraded: number; status: string };
  monitoring: { outputs24h: number; triggers24h: number; status: string };
  qualification: { topLeads: number; status: string };
  pipeline: { rows: number; stages: Array<{ stage: string; count: number; coverage?: string }>; status: string };
  frontend_runtime: { status: string; stack: string };
  deploy_health: { status: string; note: string };
};
export type SourceEntry = { id: string; name: string; sourceType: string; category: string; status: string; health: string };
export type SessionData = { access_token: string; refresh_token?: string; expires_at: number; user: { id: string; email?: string; role?: string } };
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

export type PipelineRow = {
  id: string;
  companyId: string;
  stage: PipelineStage;
  owner: Owner;
  nextAction: string;
  createdAt: string;
  updatedAt: string;
};

export type ActivityRecord = {
  id: string;
  companyId: string;
  type: ActivityType;
  title: string;
  description: string;
  owner: Owner;
  status: ActivityStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskRecord = {
  id: string;
  companyId: string;
  title: string;
  description: string;
  owner: Owner;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};
