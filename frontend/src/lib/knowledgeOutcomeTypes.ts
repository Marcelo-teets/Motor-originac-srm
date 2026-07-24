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

export type KnowledgeOutcomeOperationsSummary = {
  pendingOutcomes: number;
  overdueTasks: number;
  dueSoonTasks: number;
  stalePipelines: number;
  adoptionCandidates: number;
};

export type KnowledgePendingOutcome = {
  activityId: string;
  companyId: string;
  companyName: string;
  nodeId: string;
  nodeTitle: string;
  activityType: string;
  title: string;
  description: string | null;
  ownerName: string | null;
  occurredAt: string;
  contextMode: string;
  taskId: string | null;
  taskStatus: string | null;
  dueAt: string | null;
  ageDays: number;
};

export type KnowledgeOutcomeTask = {
  taskId: string;
  companyId: string;
  companyName: string;
  pipelineId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  ownerName: string | null;
  knowledgeActivityId: string | null;
  isOutcomeTask: boolean;
};

export type KnowledgeStalePipeline = {
  pipelineId: string;
  companyId: string;
  companyName: string;
  stage: string;
  status: string;
  priority: string;
  nextAction: string | null;
  nextActionDueAt: string | null;
  expectedStructure: string | null;
  reason: 'missing_next_action' | 'overdue_next_action' | string;
};

export type KnowledgeActivityAdoptionCandidate = {
  activityId: string;
  companyId: string;
  companyName: string;
  pipelineId: string;
  activityType: string;
  title: string;
  description: string | null;
  ownerName: string | null;
  occurredAt: string;
  ageDays: number;
  canAdopt: boolean;
};

export type KnowledgeOutcomeOperations = {
  generatedAt: string;
  scope: 'global' | 'company';
  companyId: string | null;
  windowDays: number;
  summary: KnowledgeOutcomeOperationsSummary;
  pendingOutcomes: KnowledgePendingOutcome[];
  overdueTasks: KnowledgeOutcomeTask[];
  dueSoonTasks: KnowledgeOutcomeTask[];
  stalePipelines: KnowledgeStalePipeline[];
  adoptionCandidates: KnowledgeActivityAdoptionCandidate[];
  caveat: string;
};

export type AdoptExistingActivityResult = {
  status: 'instrumented' | 'already_instrumented';
  activityId: string;
  companyId: string;
  pipelineId?: string;
  nodeId: string;
  nodeTitle?: string;
  taskId?: string;
  contextMode: string;
};
