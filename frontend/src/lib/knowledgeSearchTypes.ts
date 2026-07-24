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
