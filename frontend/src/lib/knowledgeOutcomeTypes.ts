export type OutcomeSampleQuality = 'insufficient' | 'directional' | 'stronger';

export type KnowledgeOutcomeSummary = {
  executions: number;
  companiesObserved: number;
  completedOutcomes: number;
  openExecutions: number;
  won: number;
  lost: number;
  progress: number;
  blocked: number;
  noChange: number;
  terminalDecisions: number;
  observedWinRate: number | null;
  observedStageAdvanceRate: number | null;
  averageCycleDays: number | null;
  capturedContextCount: number;
  reconstructedContextCount: number;
};

export type KnowledgeOutcomeDimension = {
  dimensionType: string;
  dimensionValue: string;
  executions: number;
  companiesObserved: number;
  completedOutcomes: number;
  won: number;
  lost: number;
  progress: number;
  blocked: number;
  noChange: number;
  open: number;
  terminalDecisions: number;
  observedWinRate: number | null;
  observedStageAdvanceRate: number | null;
  averageCycleDays: number | null;
  capturedContextCount: number;
  reconstructedContextCount: number;
  sampleQuality: OutcomeSampleQuality;
  latestObservationAt: string | null;
};

export type FactorPipelineOutcome = {
  factorCode: string;
  factorName: string;
  dimension: string;
  companiesObserved: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  activePipeline: number;
  unworked: number;
  averageFactorScore: number | null;
  averageNetContribution: number | null;
  averageConfidence: number | null;
  observedPositiveRate: number | null;
  sampleQuality: OutcomeSampleQuality;
  latestEvidenceAt: string | null;
};

export type KnowledgeRecentExecutionOutcome = {
  activityId: string;
  companyId: string;
  companyName: string;
  nodeId: string;
  nodeTitle: string;
  activityType: string;
  title: string;
  outcomeStatus: string | null;
  outcome: string | null;
  suggestedStructure: string | null;
  occurredAt: string;
  completedAt: string | null;
  cycleDays: number | null;
  contextMode: string;
};

export type KnowledgeOutcomeDimensions = {
  actionTypes: KnowledgeOutcomeDimension[];
  nodeTypes: KnowledgeOutcomeDimension[];
  structures: KnowledgeOutcomeDimension[];
  signalTypes: KnowledgeOutcomeDimension[];
  patterns: KnowledgeOutcomeDimension[];
  factors: KnowledgeOutcomeDimension[];
};

export type KnowledgeOutcomeIntelligence = {
  generatedAt: string;
  scope: 'global' | 'company';
  companyId: string | null;
  windowDays: number;
  summary: KnowledgeOutcomeSummary;
  dimensions: KnowledgeOutcomeDimensions;
  factorPipelineMap: FactorPipelineOutcome[];
  recentExecutions: KnowledgeRecentExecutionOutcome[];
  caveat: string;
};
