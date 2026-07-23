export type KnowledgeNodeType =
  | 'note'
  | 'company'
  | 'thesis'
  | 'signal'
  | 'meeting'
  | 'source'
  | 'playbook'
  | 'structure';

export type KnowledgeVisibility = 'team' | 'private';
export type KnowledgeSavedViewType = 'table' | 'cards' | 'graph';
export type KnowledgeSortOrder = 'updated_desc' | 'updated_asc' | 'title_asc' | 'title_desc';
export type KnowledgePipelineStage = 'Identified' | 'Qualified' | 'Approach' | 'Structuring' | 'Mandated' | 'ClosedWon' | 'ClosedLost' | 'Recycled';
export type KnowledgeActivityType = 'follow_up' | 'meeting' | 'email' | 'call' | 'research' | 'committee' | 'other';
export type KnowledgeOutcomeStatus = 'progress' | 'won' | 'lost' | 'blocked' | 'no_change';

export type KnowledgeReferenceType =
  | 'company_signal'
  | 'monitoring_output'
  | 'qualification_snapshot'
  | 'pipeline'
  | 'activity'
  | 'task';

export type KnowledgeNodeSummary = {
  id: string;
  title: string;
  slug: string;
  nodeType: KnowledgeNodeType;
  excerpt: string;
  tags: string[];
  properties: Record<string, unknown>;
  companyId: string | null;
  companyName: string | null;
  visibility: KnowledgeVisibility;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  backlinkCount: number;
  outboundCount: number;
  referenceCount?: number;
};

export type KnowledgeNode = Omit<KnowledgeNodeSummary, 'companyName' | 'backlinkCount' | 'outboundCount' | 'referenceCount'> & {
  contentMarkdown: string;
};

export type KnowledgeOutgoingLink = {
  id: string;
  targetNodeId: string | null;
  targetTitle: string;
  targetSlug: string;
  relationType: string;
  resolvedTitle: string | null;
};

export type KnowledgeBacklink = {
  id: string;
  sourceNodeId: string;
  sourceTitle: string;
  sourceSlug: string;
  relationType: string;
};

export type KnowledgeVersion = {
  id: string;
  versionNumber: number;
  createdBy: string;
  createdAt: string;
};

export type KnowledgeReference = {
  id: string;
  companyId: string;
  referenceType: KnowledgeReferenceType;
  referenceId: string;
  label: string;
  snapshot: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
};

export type KnowledgeNodeDetail = {
  node: KnowledgeNode;
  companyName: string | null;
  outgoing: KnowledgeOutgoingLink[];
  backlinks: KnowledgeBacklink[];
  versions: KnowledgeVersion[];
  references: KnowledgeReference[];
};

export type SaveKnowledgeNodeInput = {
  id?: string | null;
  title: string;
  nodeType: KnowledgeNodeType;
  contentMarkdown: string;
  tags: string[];
  properties?: Record<string, unknown>;
  companyId?: string | null;
  visibility: KnowledgeVisibility;
};

export type KnowledgeViewFilters = {
  query?: string;
  nodeType?: string;
  companyId?: string;
  tag?: string;
};

export type KnowledgeSavedView = {
  id: string;
  name: string;
  description: string;
  viewType: KnowledgeSavedViewType;
  filters: KnowledgeViewFilters;
  sortConfig: { order?: KnowledgeSortOrder };
  columns: string[];
  isShared: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

export type SaveKnowledgeViewInput = {
  id?: string | null;
  name: string;
  description?: string;
  viewType?: KnowledgeSavedViewType;
  filters: KnowledgeViewFilters;
  sortConfig?: { order?: KnowledgeSortOrder };
  columns?: string[];
  isShared?: boolean;
};

export type KnowledgeGraphNode = {
  id: string;
  title: string;
  slug: string;
  nodeType: KnowledgeNodeType;
  companyId: string | null;
  tags: string[];
  updatedAt: string;
};

export type KnowledgeCompanyGraphNode = {
  id: string;
  name: string;
};

export type KnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string | null;
  targetTitle?: string;
  relationType: string;
};

export type KnowledgeGraphSnapshot = {
  nodes: KnowledgeGraphNode[];
  companyNodes: KnowledgeCompanyGraphNode[];
  edges: KnowledgeGraphEdge[];
  companyEdges: KnowledgeGraphEdge[];
};

export type KnowledgeCompanySignal = {
  id: string;
  type: string;
  label: string;
  strength: number;
  confidence: number;
  isExplicit: boolean;
  evidenceText: string | null;
  evidenceUrl: string | null;
  observedAt: string;
  capturedNodeId: string | null;
};

export type KnowledgeQualificationSnapshot = {
  id: string;
  totalScore: number | null;
  fundingNeedScore: number | null;
  urgencyScore: number | null;
  sourceConfidenceScore: number | null;
  suggestedStructure: string | null;
  capitalStructureRationale: string | null;
  fundingGapLevel: string | null;
  fitFidc: boolean | null;
  fitDcm: boolean | null;
  nextAction: string | null;
  createdAt: string;
};

export type KnowledgeMonitoringOutput = {
  id: string;
  title: string | null;
  summary: string | null;
  url: string | null;
  outputType: string;
  confidenceScore: number | null;
  connectorStatus: string;
  status: string;
  observedVsInferred: string;
  sourceName: string | null;
  observedAt: string;
  capturedNodeId: string | null;
};

export type KnowledgePipelineSnapshot = {
  id: string;
  stage: string;
  status: string;
  priority: string;
  nextAction: string | null;
  nextActionDueAt: string | null;
  expectedStructure: string | null;
  expectedTicket: number | null;
  updatedAt: string;
};

export type KnowledgeExecutionPipeline = KnowledgePipelineSnapshot & {
  owner: string | null;
};

export type KnowledgeExecutionItem = {
  activityId: string;
  nodeId: string;
  nodeTitle: string;
  activityType: KnowledgeActivityType;
  title: string;
  description: string | null;
  owner: string | null;
  occurredAt: string;
  status: 'open' | 'done';
  outcomeStatus: KnowledgeOutcomeStatus | null;
  outcome: string | null;
  fromStage: string | null;
  toStage: string | null;
  requestedStage: string | null;
  requestedNextAction: string | null;
  actualNextAction: string | null;
  resultFromStage: string | null;
  resultToStage: string | null;
  resultRequestedStage: string | null;
  resultRequestedNextAction: string | null;
  resultActualNextAction: string | null;
  completedAt: string | null;
  taskId: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
  dueAt: string | null;
};

export type KnowledgeExecutionWorkspace = {
  companyId: string;
  pipeline: KnowledgeExecutionPipeline | null;
  executions: KnowledgeExecutionItem[];
  openTaskCount: number;
};

export type CreateKnowledgeExecutionInput = {
  nodeId: string;
  idempotencyKey: string;
  activityType: KnowledgeActivityType;
  title: string;
  description?: string | null;
  nextAction?: string | null;
  dueAt?: string | null;
  targetStage?: KnowledgePipelineStage | null;
};

export type CompleteKnowledgeExecutionInput = {
  activityId: string;
  idempotencyKey: string;
  outcomeStatus: KnowledgeOutcomeStatus;
  outcome: string;
  nextAction?: string | null;
  dueAt?: string | null;
  targetStage?: KnowledgePipelineStage | null;
};

export type KnowledgeCompanyWorkspace = {
  company: {
    id: string;
    name: string;
    cnpj: string | null;
    stage: string | null;
  };
  nodes: KnowledgeNodeSummary[];
  latestQualification: KnowledgeQualificationSnapshot | null;
  signals: KnowledgeCompanySignal[];
  monitoringOutputs: KnowledgeMonitoringOutput[];
  pipeline: KnowledgePipelineSnapshot | null;
  execution: KnowledgeExecutionWorkspace;
};
