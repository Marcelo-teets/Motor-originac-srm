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
};

export type KnowledgeNode = Omit<KnowledgeNodeSummary, 'companyName' | 'backlinkCount' | 'outboundCount'> & {
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

export type KnowledgeNodeDetail = {
  node: KnowledgeNode;
  companyName: string | null;
  outgoing: KnowledgeOutgoingLink[];
  backlinks: KnowledgeBacklink[];
  versions: KnowledgeVersion[];
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
