export const buildEngineRequest = (params: {
  requesterEngine: 'data_capture_engine' | 'data_enrichment_engine';
  targetEngine: 'data_capture_engine' | 'data_enrichment_engine';
  companyId?: string | null;
  sourceId?: string | null;
  requestType: string;
  priority?: 'high' | 'medium' | 'low';
  status?: 'queued' | 'running' | 'completed' | 'failed';
  reason: string;
  evidencePayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
}) => ({
  requester_engine: params.requesterEngine,
  target_engine: params.targetEngine,
  company_id: params.companyId ?? null,
  source_id: params.sourceId ?? null,
  request_type: params.requestType,
  priority: params.priority ?? 'medium',
  status: params.status ?? 'queued',
  reason: params.reason,
  evidence_payload: params.evidencePayload ?? {},
  response_payload: params.responsePayload ?? {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
