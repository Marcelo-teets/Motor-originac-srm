export const buildLearningEvent = (params: {
  engineName: string;
  eventType: string;
  summary: string;
  severity?: 'info' | 'warning' | 'critical';
  companyId?: string | null;
  sourceId?: string | null;
  payload?: Record<string, unknown>;
}) => ({
  engine_name: params.engineName,
  company_id: params.companyId ?? null,
  source_id: params.sourceId ?? null,
  event_type: params.eventType,
  severity: params.severity ?? 'info',
  summary: params.summary,
  payload: params.payload ?? {},
  created_at: new Date().toISOString(),
});
