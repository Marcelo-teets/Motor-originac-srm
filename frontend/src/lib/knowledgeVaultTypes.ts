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

export type KnowledgeReferenceType =
  | 'company_signal'
  | 'monitoring_output'
  | 'qualification_snapshot'
  | 'pipeline';

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
  observedAt: string;
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
};
