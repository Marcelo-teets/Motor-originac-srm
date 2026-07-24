import { getSupabaseClient } from './supabase.js';

export type CaptureAuditInput = {
  triggerType: 'cron' | 'manual';
  status: 'completed' | 'partial' | 'failed';
  startedAt: string;
  finishedAt: string;
  companyId: string;
  sourceId: string;
  itemsCollected?: number;
  outputsWritten?: number;
  signalsWritten?: number;
  enrichmentsWritten?: number;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeCaptureAudit(input: CaptureAuditInput): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.insert('source_connector_runs', [{
      id: crypto.randomUUID(),
      company_id: input.companyId,
      source_id: input.sourceId,
      scope_type: 'company',
      trigger_type: input.triggerType,
      status: input.status,
      started_at: input.startedAt,
      finished_at: input.finishedAt,
      items_collected: input.itemsCollected ?? 0,
      outputs_written: input.outputsWritten ?? 0,
      signals_written: input.signalsWritten ?? 0,
      enrichments_written: input.enrichmentsWritten ?? 0,
      error_message: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
    }]);
  } catch (error) {
    console.warn('[bounded-capture-audit]', error instanceof Error ? error.message : error);
  }
}
