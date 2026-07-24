export type KnowledgeSearchMode = 'hybrid' | 'lexical';

export type KnowledgeSearchLineage = {
  vectorDocumentId: string;
  sourceTable: string;
  sourceId: string | null;
  companyId: string | null;
};

export type KnowledgeSearchResult = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  content: string;
  sourceTable: string;
  sourceId: string | null;
  sourceCatalogId: string | null;
  signalType: string | null;
  observedVsInferred: string | null;
  confidenceScore: number | null;
  sourceCreatedAt: string | null;
  lexicalScore: number | null;
  lexicalRank: number | null;
  semanticSimilarity: number | null;
  semanticRank: number | null;
  rrfScore: number;
  lineage: KnowledgeSearchLineage;
};

export type KnowledgeSearchResponse = {
  status: 'real';
  generatedAt: string;
  query: string;
  mode: KnowledgeSearchMode;
  semanticAvailable: boolean;
  companyId: string | null;
  matchCount: number;
  corpus: {
    documents: number;
    embeddedDocuments: number;
  };
  results: KnowledgeSearchResult[];
  caveat: string;
  runtime: string;
  semantic: {
    available: boolean;
    model: string | null;
    dimensions: number | null;
    fallbackReason: string | null;
    syntheticEmbedding: false;
  };
};

export type KnowledgeEmbeddingCoverage = {
  generatedAt: string;
  modelContract: {
    provider: string;
    model: string;
    dimensions: number;
    syntheticEmbeddingsAllowed: false;
  };
  documents: {
    total: number;
    embedded: number;
    pending: number;
    coveragePct: number;
  };
  jobs: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    dead: number;
    completedToday: number;
    baselineEmbedded: number;
    oldestPendingAt: string | null;
    lastCompletedAt: string | null;
  };
  bySource: Array<{
    sourceTable: string;
    documents: number;
    embedded: number;
    pending: number;
    coveragePct: number;
  }>;
  caveat: string;
};
