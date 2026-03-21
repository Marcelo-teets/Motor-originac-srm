export type ApiEnvelope<T> = {
  status: 'real' | 'partial' | 'mock';
  generatedAt?: string;
  data: T;
  error?: string;
};

export type Dashboard = {
  summary: Array<{ label: string; value: string; tone: string; helper: string }>;
  topLeads: Array<{ companyId: string; companyName: string; qualificationScore: number; leadScore: number; triggerStrength: number; suggestedStructure: string; bucket: string }>;
  monitoring: { activeSources: number; outputs24h: number; triggers24h: number; websiteChecks: number };
  agents: Array<{ name: string; status: string; lastRun: string; note: string }>;
  patterns: Array<{ pattern: string; companies: number; avgImpact: number }>;
  pipeline: Array<{ stage: string; count: number; coverage: string }>;
  charts: { qualificationVsLead: Array<{ company: string; qualification: number; lead: number }> };
};

export type CompanyListItem = {
  id: string;
  name: string;
  segment: string;
  subsegment: string;
  suggestedStructure: string;
  qualificationScore: number;
  leadScore: number;
  predictedFundingNeed: number;
  leadBucket: string;
  triggerStrength: number;
  sourceConfidence: number;
  topPatterns: string[];
};

export type CompanyDetail = {
  company: CompanyListItem & { description: string; currentFundingStructure: string; stage: string; cnpj: string; website: string; geography: string; product: string; receivables: string[]; thesis: string; nextAction: string; urgencyScore: number };
  qualification: Record<string, unknown> & { qualification_score_total: number; predicted_funding_need_score: number; urgency_score: number; source_confidence_score: number; suggested_structure_type: string; capital_structure_rationale: string; pattern_summary: string[] };
  patterns: Array<{ id: string; patternName: string; rationale: string; confidenceScore: number; leadScoreImpact: number; rankingImpact: number }>;
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
