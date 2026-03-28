export type LearningEventLevel = 'info' | 'warning' | 'critical';

export type LearningEventRecord = {
  engineName: 'data_capture_engine' | 'data_enrichment_engine';
  companyId?: string;
  sourceId?: string;
  eventType: string;
  severity: LearningEventLevel;
  summary: string;
  payload: Record<string, unknown>;
};
