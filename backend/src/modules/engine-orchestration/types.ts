export type EngineName = 'data_capture_engine' | 'data_enrichment_engine';

export type EngineRequestKind =
  | 'confirm_signal'
  | 'collect_identity'
  | 'recheck_website'
  | 'regulatory_confirmation'
  | 'resolve_alias';

export type EngineRequestRecord = {
  requesterEngine: EngineName;
  targetEngine: EngineName;
  companyId?: string;
  sourceId?: string;
  requestType: EngineRequestKind;
  priority: 'high' | 'medium' | 'low';
  status: 'queued' | 'running' | 'completed' | 'failed';
  reason?: string;
  evidencePayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
};
