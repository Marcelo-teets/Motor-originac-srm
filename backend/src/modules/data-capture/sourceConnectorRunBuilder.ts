export const buildSourceConnectorRun = (params: {
  companyId?: string | null;
  sourceId?: string | null;
  scopeType: string;
  triggerType: string;
  status: string;
  itemsCollected?: number;
  outputsWritten?: number;
  signalsWritten?: number;
  enrichmentsWritten?: number;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) => ({
  company_id: params.companyId ?? null,
  source_id: params.sourceId ?? null,
  scope_type: params.scopeType,
  trigger_type: params.triggerType,
  status: params.status,
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  items_collected: params.itemsCollected ?? 0,
  outputs_written: params.outputsWritten ?? 0,
  signals_written: params.signalsWritten ?? 0,
  enrichments_written: params.enrichmentsWritten ?? 0,
  error_message: params.errorMessage ?? null,
  metadata: params.metadata ?? {},
});
