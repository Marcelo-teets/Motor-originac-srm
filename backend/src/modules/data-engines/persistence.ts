import { getSupabaseClient } from '../../lib/supabase.js';
import type { AliasRecord } from '../data-enrichment/types.js';
import type { CaptureEngineResult } from '../data-capture/types.js';

type LearningEventInput = {
  engineName: 'data_capture_engine' | 'data_enrichment_engine';
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  summary: string;
  companyId?: string;
  sourceId?: string;
  payload?: Record<string, unknown>;
};

export class DataEnginesPersistence {
  private readonly client = getSupabaseClient();

  async saveCaptureArtifacts(results: CaptureEngineResult[]) {
    if (!this.client || !results.length) return;

    await this.client.insert('source_connector_runs', results.map((result) => ({
      company_id: result.run.companyId,
      source_id: result.run.sourceId,
      scope_type: result.run.scopeType,
      trigger_type: result.run.triggerType,
      status: result.run.status,
      items_collected: result.run.itemsCollected,
      outputs_written: result.run.outputsWritten,
      signals_written: result.run.signalsWritten,
      enrichments_written: result.run.enrichmentsWritten,
      metadata: {},
    })));

    await this.client.upsert('source_documents', results.flatMap((result) => result.documents.map((document) => ({
      id: document.id,
      company_id: document.companyId,
      source_id: document.sourceId,
      document_type: document.documentType,
      external_id: document.externalId,
      canonical_url: document.canonicalUrl,
      title: document.title,
      published_at: document.publishedAt,
      observed_at: document.observedAt,
      content_hash: document.contentHash,
      raw_payload: document.rawPayload,
      normalized_payload: document.normalizedPayload,
      extraction_status: document.extractionStatus,
    }))), 'id');
  }

  async saveAliases(aliases: AliasRecord[]) {
    if (!this.client || !aliases.length) return;

    await this.client.upsert('company_entity_aliases', aliases.map((alias) => ({
      company_id: alias.companyId,
      alias_type: alias.aliasType,
      alias_value: alias.aliasValue,
      confidence_score: alias.confidenceScore,
    })), 'company_id,alias_type,alias_value');
  }

  async saveLearningEvent(input: LearningEventInput) {
    if (!this.client) return;

    await this.client.insert('engine_learning_events', [{
      engine_name: input.engineName,
      company_id: input.companyId,
      source_id: input.sourceId,
      event_type: input.eventType,
      severity: input.severity,
      summary: input.summary,
      payload: input.payload ?? {},
    }]);
  }
}
