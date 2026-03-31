import { env } from '../lib/env.js';
import { createPlatformRepository } from '../repositories/platformRepository.js';
import { DataCaptureEngine } from '../modules/data-capture/dataCaptureEngine.js';
import { DataTreatmentEngine } from '../modules/data-enrichment/dataTreatmentEngine.js';
import { DataEngineOpsStore } from './dataEngineOpsStore.js';

export class DataEngineScheduler {
  private readonly repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
  private readonly captureEngine = new DataCaptureEngine();
  private readonly treatmentEngine = new DataTreatmentEngine();
  private readonly opsStore = new DataEngineOpsStore();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start() {
    if (!process.env.ENABLE_DATA_ENGINE_SCHEDULER || process.env.ENABLE_DATA_ENGINE_SCHEDULER !== 'true' || this.timer) return;
    const intervalMs = Number(process.env.DATA_ENGINE_SCHEDULER_INTERVAL_MS ?? 900000);
    this.timer = setInterval(() => {
      void this.tick('scheduled');
    }, intervalMs);
    console.log(`[data-engines] scheduler started (${intervalMs} ms)`);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async tick(reason: 'scheduled' | 'manual' = 'scheduled') {
    if (this.running) return { skipped: true, reason: 'already_running' };
    this.running = true;
    const startedAt = new Date().toISOString();

    try {
      const [companies, sources] = await Promise.all([
        this.repository.listCompanies(),
        this.repository.listSources(),
      ]);

      const captureResults = await this.captureEngine.run(
        { scopeType: 'global', triggerType: reason, sourceId: undefined, companyId: undefined },
        companies,
        sources,
      );

      await this.repository.saveMonitoringOutputs(captureResults.flatMap((item) => item.outputs));
      await this.repository.saveCompanySignals(captureResults.flatMap((item) => item.signals));
      await this.repository.saveEnrichments(captureResults.flatMap((item) => item.enrichments));
      await this.opsStore.saveSourceDocuments(captureResults.flatMap((item) => item.documents).map((doc) => ({
        id: doc.id,
        company_id: doc.companyId,
        source_id: doc.sourceId,
        document_type: doc.documentType,
        external_id: doc.externalId,
        canonical_url: doc.canonicalUrl,
        title: doc.title,
        published_at: doc.publishedAt,
        observed_at: doc.observedAt,
        content_hash: doc.contentHash,
        raw_payload: doc.rawPayload,
        normalized_payload: doc.normalizedPayload,
        extraction_status: doc.extractionStatus,
      })));

      const outputs = await this.repository.listMonitoringOutputs();
      const enrichmentResults = this.treatmentEngine.run({ reason, companyId: undefined }, companies, outputs);

      await this.opsStore.saveLearningEvents([
        {
          engine_name: 'data_capture_engine',
          event_type: 'scheduler_capture_completed',
          severity: 'info',
          summary: `Scheduled capture completed for ${captureResults.length} companies.`,
          payload: {
            startedAt,
            outputsWritten: captureResults.reduce((sum, item) => sum + item.outputs.length, 0),
            signalsWritten: captureResults.reduce((sum, item) => sum + item.signals.length, 0),
          },
          created_at: new Date().toISOString(),
        },
        {
          engine_name: 'data_enrichment_engine',
          event_type: 'scheduler_enrichment_completed',
          severity: 'info',
          summary: `Scheduled enrichment completed for ${enrichmentResults.length} companies.`,
          payload: {
            startedAt,
            aliasesGenerated: enrichmentResults.reduce((sum, item) => sum + item.aliases.length, 0),
            captureRequestsCreated: enrichmentResults.reduce((sum, item) => sum + item.requestsCreated, 0),
          },
          created_at: new Date().toISOString(),
        },
      ]);

      return {
        skipped: false,
        companiesProcessed: captureResults.length,
        outputsWritten: captureResults.reduce((sum, item) => sum + item.outputs.length, 0),
        signalsWritten: captureResults.reduce((sum, item) => sum + item.signals.length, 0),
        enrichmentsWritten: captureResults.reduce((sum, item) => sum + item.enrichments.length, 0),
        aliasesGenerated: enrichmentResults.reduce((sum, item) => sum + item.aliases.length, 0),
      };
    } finally {
      this.running = false;
    }
  }
}
