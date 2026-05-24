import { getSupabaseClient } from '../lib/supabase.js';
import type { CompanySignal, EnrichmentRecord, MonitoringOutput } from '../types/platform.js';
import type { CaptureEngineResult, CanonicalSourceDocument } from '../modules/data-capture/types.js';

type RuntimeStatus = 'real' | 'partial';

const asPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
};

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const firstItemLink = (value: unknown) => {
  if (!Array.isArray(value)) return undefined;
  const first = value[0];
  if (!first || typeof first !== 'object') return undefined;
  return pickString((first as Record<string, unknown>).link, (first as Record<string, unknown>).url);
};

const evidenceArrayText = (value: unknown) => {
  if (!Array.isArray(value)) return undefined;
  const text = value.map((item) => String(item)).filter(Boolean).join(' | ');
  return text || undefined;
};

const sourceUrlFromOutput = (output: MonitoringOutput) => pickString(
  output.normalizedPayload?.sourceUrl,
  output.normalizedPayload?.canonicalUrl,
  output.normalizedPayload?.endpoint,
  firstItemLink(output.normalizedPayload?.items),
);

const signalEvidenceText = (signal: CompanySignal) => pickString(
  signal.evidencePayload?.note,
  signal.evidencePayload?.summary,
  evidenceArrayText(signal.evidencePayload?.evidence),
  signal.signalType,
) ?? signal.signalType;

const signalEvidenceUrl = (signal: CompanySignal) => pickString(
  signal.evidencePayload?.sourceUrl,
  signal.evidencePayload?.canonicalUrl,
);

const sourceIdFromEnrichment = (enrichment: EnrichmentRecord) => pickString(enrichment.payload?.sourceId);

export type CapturePersistenceSummary = {
  status: RuntimeStatus;
  companiesProcessed: number;
  runsWritten: number;
  outputsWritten: number;
  signalsWritten: number;
  enrichmentsWritten: number;
  documentsWritten: number;
  learningEventsWritten: number;
  errors: string[];
};

export class CapturePersistenceService {
  private readonly client = getSupabaseClient();

  async persist(results: CaptureEngineResult[], reason: string): Promise<CapturePersistenceSummary> {
    if (!this.client) {
      return {
        status: 'partial',
        companiesProcessed: results.length,
        runsWritten: 0,
        outputsWritten: 0,
        signalsWritten: 0,
        enrichmentsWritten: 0,
        documentsWritten: 0,
        learningEventsWritten: 0,
        errors: ['Supabase client not configured.'],
      };
    }

    const now = new Date().toISOString();
    const runRows = results.map((result) => ({
      id: crypto.randomUUID(),
      company_id: result.run.companyId ?? null,
      source_id: result.run.sourceId ?? null,
      scope_type: result.run.scopeType,
      trigger_type: result.run.triggerType,
      status: result.run.status,
      started_at: now,
      finished_at: now,
      items_collected: result.run.itemsCollected,
      outputs_written: result.outputs.length,
      signals_written: result.signals.length,
      enrichments_written: result.enrichments.length,
      metadata: result.run.diagnostics ?? {},
    }));

    const runIdByCompany = new Map<string, string>();
    results.forEach((result, index) => {
      if (result.run.companyId) runIdByCompany.set(result.run.companyId, runRows[index].id);
    });

    const allOutputs = results.flatMap((result) => result.outputs);
    const outputRows = allOutputs.map((output) => ({
      id: output.id,
      company_id: output.companyId,
      source_id: output.sourceId,
      output_type: 'raw',
      title: output.title,
      url: sourceUrlFromOutput(output) ?? null,
      raw_text: output.summary,
      summary: output.summary,
      observed_at: output.collectedAt,
      processed_at: now,
      status: output.connectorStatus === 'real' ? 'processed' : 'partial',
      source_confidence: asPercent(output.confidenceScore),
      payload: {
        ...output.normalizedPayload,
        connectorStatus: output.connectorStatus,
        confidenceScore: output.confidenceScore,
      },
    }));

    const outputIdByCompanyAndSource = new Map<string, string>();
    allOutputs.forEach((output) => {
      outputIdByCompanyAndSource.set(`${output.companyId}|${output.sourceId}`, output.id);
    });

    const allSignals = results.flatMap((result) => result.signals);
    const signalRows = allSignals.map((signal) => ({
      id: signal.id,
      company_id: signal.companyId,
      monitoring_output_id: signal.sourceId ? outputIdByCompanyAndSource.get(`${signal.companyId}|${signal.sourceId}`) ?? null : null,
      signal_type: signal.signalType,
      signal_label: String(signal.evidencePayload?.label ?? signal.signalType).replace(/_/g, ' '),
      strength: asPercent(signal.signalStrength),
      confidence: asPercent(signal.confidenceScore),
      is_explicit: signal.observedVsInferred === 'observed',
      evidence_url: signalEvidenceUrl(signal) ?? null,
      evidence_text: signalEvidenceText(signal),
      observed_at: signal.createdAt,
      metadata: {
        ...signal.evidencePayload,
        source_id: signal.sourceId,
        observedVsInferred: signal.observedVsInferred,
      },
    }));

    const allEnrichments = results.flatMap((result) => result.enrichments);
    const enrichmentRows = allEnrichments.map((enrichment) => ({
      id: enrichment.id,
      company_id: enrichment.companyId,
      enrichment_type: enrichment.enrichmentType,
      provider: enrichment.provider ?? null,
      payload: {
        ...enrichment.payload,
        source_id: sourceIdFromEnrichment(enrichment) ?? null,
        observedVsInferred: enrichment.observedVsInferred,
      },
      observed_vs_inferred: enrichment.observedVsInferred,
      created_at: enrichment.createdAt,
    }));

    const allDocuments = results.flatMap((result) => result.documents);
    const documentRows = allDocuments.map((doc: CanonicalSourceDocument) => ({
      id: doc.id,
      run_id: doc.companyId ? runIdByCompany.get(doc.companyId) ?? null : null,
      company_id: doc.companyId,
      source_id: doc.sourceId,
      document_type: doc.documentType,
      external_id: doc.externalId ?? null,
      canonical_url: doc.canonicalUrl || null,
      title: doc.title,
      published_at: doc.publishedAt ?? null,
      observed_at: doc.observedAt,
      content_hash: doc.contentHash,
      raw_payload: doc.rawPayload,
      normalized_payload: doc.normalizedPayload,
      extraction_status: doc.extractionStatus,
      confidence_score: doc.confidenceScore ?? null,
    }));

    const learningRows = [{
      engine_name: 'data_capture_engine',
      event_type: 'capture_runtime_persisted',
      severity: 'info',
      summary: `Capture runtime persisted ${outputRows.length} outputs, ${signalRows.length} signals and ${enrichmentRows.length} enrichments.`,
      payload: {
        reason,
        companiesProcessed: results.length,
        outputsWritten: outputRows.length,
        signalsWritten: signalRows.length,
        enrichmentsWritten: enrichmentRows.length,
        documentsWritten: documentRows.length,
      },
      created_at: now,
    }];

    const errors: string[] = [];
    let runsWritten = 0;
    let outputsWritten = 0;
    let signalsWritten = 0;
    let enrichmentsWritten = 0;
    let documentsWritten = 0;
    let learningEventsWritten = 0;

    try {
      if (runRows.length) {
        await this.client.insert('source_connector_runs', runRows);
        runsWritten = runRows.length;
      }
    } catch (error) {
      errors.push(`source_connector_runs: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      if (outputRows.length) {
        await this.client.upsert('monitoring_outputs', outputRows, 'id');
        outputsWritten = outputRows.length;
      }
    } catch (error) {
      errors.push(`monitoring_outputs: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      if (signalRows.length) {
        await this.client.upsert('company_signals', signalRows, 'id');
        signalsWritten = signalRows.length;
      }
    } catch (error) {
      errors.push(`company_signals: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      if (enrichmentRows.length) {
        await this.client.upsert('enrichments', enrichmentRows, 'id');
        enrichmentsWritten = enrichmentRows.length;
      }
    } catch (error) {
      errors.push(`enrichments: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      if (documentRows.length) {
        await this.client.upsert('source_documents', documentRows, 'id');
        documentsWritten = documentRows.length;
      }
    } catch (error) {
      errors.push(`source_documents: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      await this.client.insert('engine_learning_events', learningRows);
      learningEventsWritten = learningRows.length;
    } catch (error) {
      errors.push(`engine_learning_events: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      status: errors.length ? 'partial' : 'real',
      companiesProcessed: results.length,
      runsWritten,
      outputsWritten,
      signalsWritten,
      enrichmentsWritten,
      documentsWritten,
      learningEventsWritten,
      errors,
    };
  }
}
