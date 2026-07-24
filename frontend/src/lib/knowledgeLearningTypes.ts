export type KnowledgeLearningRun = {
  id: string;
  companyId: string;
  companyName: string;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  model: string;
  nodesCreated: number;
  nodesUpdated: number;
  linksApplied: number;
  referencesApplied: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

export type KnowledgeLearningStatus = {
  queue: {
    pending: number;
    processing: number;
    failed: number;
    deadLetter: number;
    completed: number;
  };
  completedToday: number;
  lastRun: KnowledgeLearningRun | null;
  recentRuns: KnowledgeLearningRun[];
};
