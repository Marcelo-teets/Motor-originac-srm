import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import {
  CVM_DATASETS,
  discoverCvmResources,
  type CvmDatasetCode,
  type CvmResource,
  type NormalizedCapitalMarketRecord,
} from '../modules/capital-markets/cvmCapitalMarketConnector.js';
import { fetchCapitalMarketResourceRecords } from '../modules/capital-markets/capitalMarketResourceAdapter.js';

const INITIAL_BATCH_SIZE = 100;
const DEFAULT_MAX_ROWS = 5_000;
const MAX_ROWS = 20_000;
const STALE_RUN_MS = 30 * 60 * 1_000;
const allDatasets = Object.keys(CVM_DATASETS) as CvmDatasetCode[];
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const isConflict = (error: unknown) => /uq_capital_market_dataset_single_running|duplicate key|23505/i.test(message(error));
const isStatementTimeout = (error: unknown) => /57014|statement timeout|canceling statement due to statement timeout/i.test(message(error));
const resourceKey = (resource: CvmResource) => resource.id?.trim() || resource.url;
const timestamp = (value: string | null | undefined) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};
const fingerprint = (resource: CvmResource) => [
  resource.id ?? resource.url,
  resource.last_modified ?? resource.created ?? 'unknown',
  resource.url,
].join('|');
const recordsHash = (records: NormalizedCapitalMarketRecord[]) => createHash('sha256')
  .update(records.map((record) => record.event.content_hash).sort().join('|'))
  .digest('hex');

export const normalizeCvmDownloadResource = (resource: CvmResource): CvmResource => {
  const name = resource.name?.trim() || 'resource';
  const csvByMetadata = /csv/i.test(resource.format ?? '');
  const csvByUrl = /\.csv(?:$|\?)/i.test(resource.url);
  if ((csvByMetadata || csvByUrl) && !/\.(?:csv|zip)$/i.test(name)) {
    return { ...resource, name: `${name}.csv` };
  }
  return resource;
};

export type CapitalMarketIngestionOptions = {
  datasets?: CvmDatasetCode[];
  reference?: string;
  maxRows?: number;
  triggerType?: 'manual' | 'schedule' | 'backfill';
};

type Checkpoint = {
  resource_key: string;
  resource_modified_at: string | null;
  content_hash: string | null;
  status: 'completed' | 'partial' | 'failed';
  last_successful_run_at: string | null;
};
type Source = { id: string; name: string; metadata?: Record<string, unknown> };

export type BatchPersistResult = {
  bronzeRowsWritten: number;
  eventsWritten: number;
  entityLinksWritten: number;
  metricsWritten: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
};

export type AdaptiveBatchPersistResult = BatchPersistResult & {
  effectiveBatchSize: number;
  timeoutSplits: number;
};

const emptyBatchPersistResult = (): BatchPersistResult => ({
  bronzeRowsWritten: 0,
  eventsWritten: 0,
  entityLinksWritten: 0,
  metricsWritten: 0,
  recordsInserted: 0,
  recordsUpdated: 0,
  recordsUnchanged: 0,
});

const addBatchPersistResult = (target: BatchPersistResult, persisted: BatchPersistResult) => {
  target.bronzeRowsWritten += Number(persisted.bronzeRowsWritten ?? 0);
  target.eventsWritten += Number(persisted.eventsWritten ?? 0);
  target.entityLinksWritten += Number(persisted.entityLinksWritten ?? 0);
  target.metricsWritten += Number(persisted.metricsWritten ?? 0);
  target.recordsInserted += Number(persisted.recordsInserted ?? 0);
  target.recordsUpdated += Number(persisted.recordsUpdated ?? 0);
  target.recordsUnchanged += Number(persisted.recordsUnchanged ?? 0);
};

export const serializeCapitalMarketBatch = (records: NormalizedCapitalMarketRecord[]) => records.map((record) => ({
  bronze: record.bronze,
  event: record.event,
  entity_links: record.entityLinks,
  metrics: record.metrics,
}));

export const persistCapitalMarketRecordsAdaptive = async (
  records: NormalizedCapitalMarketRecord[],
  persistBatch: (batch: NormalizedCapitalMarketRecord[]) => Promise<BatchPersistResult>,
  initialBatchSize = INITIAL_BATCH_SIZE,
): Promise<AdaptiveBatchPersistResult> => {
  const totals = emptyBatchPersistResult();
  let cursor = 0;
  let effectiveBatchSize = Math.max(1, Math.min(Math.floor(initialBatchSize), INITIAL_BATCH_SIZE));
  let timeoutSplits = 0;

  while (cursor < records.length) {
    const batch = records.slice(cursor, cursor + effectiveBatchSize);
    try {
      const persisted = await persistBatch(batch);
      addBatchPersistResult(totals, persisted);
      cursor += batch.length;
    } catch (error) {
      if (!isStatementTimeout(error) || batch.length <= 1) throw error;
      effectiveBatchSize = Math.max(1, Math.floor(batch.length / 2));
      timeoutSplits += 1;
    }
  }

  return { ...totals, effectiveBatchSize, timeoutSplits };
};

export type CapitalMarketDatasetSummary = {
  datasetCode: CvmDatasetCode;
  status: 'completed' | 'partial' | 'failed';
  resourcesProcessed: number;
  resourcesSkipped: number;
  recordsSeen: number;
  bronzeRowsWritten: number;
  eventsWritten: number;
  entityLinksWritten: number;
  metricsWritten: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  signalsWritten: number;
  errors: string[];
};

export const shouldSkipCapitalMarketResource = (input: {
  triggerType: 'manual' | 'schedule' | 'backfill';
  reference?: string;
  resource: CvmResource;
  checkpoint?: Checkpoint;
}) => input.triggerType === 'schedule'
  && !input.reference
  && input.checkpoint?.status === 'completed'
  && Boolean(timestamp(input.resource.last_modified ?? input.resource.created))
  && input.checkpoint.resource_modified_at === timestamp(input.resource.last_modified ?? input.resource.created);

export const capitalMarketRunStatus = (input: {
  resourcesProcessed: number;
  resourcesSkipped: number;
  recordsSeen: number;
  errors: string[];
}): CapitalMarketDatasetSummary['status'] => {
  const delivered = input.resourcesProcessed > 0 || input.resourcesSkipped > 0 || input.recordsSeen > 0;
  if (delivered && input.errors.length === 0) return 'completed';
  if (delivered) return 'partial';
  return 'failed';
};

const emptySummary = (datasetCode: CvmDatasetCode, error: string): CapitalMarketDatasetSummary => ({
  datasetCode,
  status: 'partial',
  resourcesProcessed: 0,
  resourcesSkipped: 0,
  recordsSeen: 0,
  bronzeRowsWritten: 0,
  eventsWritten: 0,
  entityLinksWritten: 0,
  metricsWritten: 0,
  recordsInserted: 0,
  recordsUpdated: 0,
  recordsUnchanged: 0,
  signalsWritten: 0,
  errors: [error],
});

export class CapitalMarketIngestionService {
  private readonly client = getSupabaseClient();
  private persistenceBatchSize = INITIAL_BATCH_SIZE;

  async run(options: CapitalMarketIngestionOptions = {}) {
    if (!this.client) throw new Error('Supabase client not configured for capital-market ingestion.');
    const datasets = options.datasets?.length ? [...new Set(options.datasets)] : allDatasets;
    const maxRows = Math.max(1, Math.min(options.maxRows ?? DEFAULT_MAX_ROWS, MAX_ROWS));
    const summaries: CapitalMarketDatasetSummary[] = [];
    for (const datasetCode of datasets) {
      summaries.push(await this.runDataset(datasetCode, {
        reference: options.reference,
        maxRows,
        triggerType: options.triggerType ?? 'manual',
      }));
    }
    return {
      status: summaries.every((item) => item.status === 'completed')
        ? 'real'
        : summaries.some((item) => item.status !== 'failed') ? 'partial' : 'failed',
      generatedAt: new Date().toISOString(),
      requested: { datasets, reference: options.reference ?? null, maxRows },
      totals: {
        resourcesProcessed: summaries.reduce((sum, item) => sum + item.resourcesProcessed, 0),
        resourcesSkipped: summaries.reduce((sum, item) => sum + item.resourcesSkipped, 0),
        recordsSeen: summaries.reduce((sum, item) => sum + item.recordsSeen, 0),
        bronzeRowsWritten: summaries.reduce((sum, item) => sum + item.bronzeRowsWritten, 0),
        eventsWritten: summaries.reduce((sum, item) => sum + item.eventsWritten, 0),
        entityLinksWritten: summaries.reduce((sum, item) => sum + item.entityLinksWritten, 0),
        metricsWritten: summaries.reduce((sum, item) => sum + item.metricsWritten, 0),
        recordsInserted: summaries.reduce((sum, item) => sum + item.recordsInserted, 0),
        recordsUpdated: summaries.reduce((sum, item) => sum + item.recordsUpdated, 0),
        recordsUnchanged: summaries.reduce((sum, item) => sum + item.recordsUnchanged, 0),
        signalsWritten: summaries.reduce((sum, item) => sum + item.signalsWritten, 0),
      },
      datasets: summaries,
    };
  }

  private async runDataset(
    datasetCode: CvmDatasetCode,
    options: { reference?: string; maxRows: number; triggerType: 'manual' | 'schedule' | 'backfill' },
  ): Promise<CapitalMarketDatasetSummary> {
    const definition = CVM_DATASETS[datasetCode];
    const startedAt = new Date().toISOString();
    const runId = crypto.randomUUID();
    const sourceRows = await this.client!.select('source_catalog', { select: 'id,name,metadata', limit: 1_000 }) as Source[];
    const source = sourceRows.find((row) => row.metadata?.code === definition.sourceCode);

    await this.client!.update('capital_market_dataset_runs', {
      status: 'failed',
      finished_at: startedAt,
      error_message: 'Automatically closed as a stale capital-market ingestion run.',
      updated_at: startedAt,
    }, [
      { column: 'dataset_code', value: datasetCode },
      { column: 'status', value: 'running' },
      { column: 'started_at', operator: 'lt', value: new Date(Date.now() - STALE_RUN_MS).toISOString() },
    ]);

    try {
      await this.client!.insert('capital_market_dataset_runs', [{
        id: runId,
        dataset_code: datasetCode,
        source_id: source?.id ?? null,
        trigger_type: options.triggerType,
        status: 'running',
        started_at: startedAt,
        metadata: { reference: options.reference ?? null, maxRows: options.maxRows, packageId: definition.packageId },
      }]);
    } catch (error) {
      if (isConflict(error)) return emptySummary(datasetCode, `Another ${datasetCode} ingestion is already running.`);
      throw error;
    }

    const checkpoints = await this.client!.select('capital_market_resource_checkpoints', {
      select: 'resource_key,resource_modified_at,content_hash,status,last_successful_run_at',
      limit: 2_000,
      filters: [{ column: 'dataset_code', value: datasetCode }],
    }) as Checkpoint[];
    const checkpointByKey = new Map(checkpoints.map((row) => [row.resource_key, row]));
    const summary: CapitalMarketDatasetSummary = {
      datasetCode,
      status: 'failed',
      resourcesProcessed: 0,
      resourcesSkipped: 0,
      recordsSeen: 0,
      bronzeRowsWritten: 0,
      eventsWritten: 0,
      entityLinksWritten: 0,
      metricsWritten: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      signalsWritten: 0,
      errors: [],
    };
    const processedFingerprints: string[] = [];
    const skippedFingerprints: string[] = [];

    try {
      const resources = (await discoverCvmResources(datasetCode, options.reference))
        .map(normalizeCvmDownloadResource);
      const candidates = resources.filter((resource) => {
        const checkpoint = checkpointByKey.get(resourceKey(resource));
        if (!shouldSkipCapitalMarketResource({ ...options, resource, checkpoint })) return true;
        summary.resourcesSkipped += 1;
        skippedFingerprints.push(fingerprint(resource));
        return false;
      });
      const budget = candidates.length ? Math.max(1, Math.floor(options.maxRows / candidates.length)) : 0;

      for (let index = 0; index < candidates.length; index += 1) {
        const resource = candidates[index];
        const checkpoint = checkpointByKey.get(resourceKey(resource));
        const remaining = options.maxRows - summary.recordsSeen;
        if (remaining <= 0) break;
        try {
          const records = await fetchCapitalMarketResourceRecords({
            datasetCode,
            resource,
            maxRows: index === candidates.length - 1 ? remaining : Math.min(remaining, budget),
            observedAt: startedAt,
          });
          summary.recordsSeen += records.length;
          const hash = recordsHash(records);
          if (options.triggerType === 'schedule' && !options.reference && checkpoint?.status === 'completed' && checkpoint.content_hash === hash) {
            summary.resourcesSkipped += 1;
            summary.recordsUnchanged += records.length;
            skippedFingerprints.push(fingerprint(resource));
            await this.saveCheckpoint(datasetCode, source?.id ?? null, resource, hash, 'completed', records.length, 0, checkpoint.last_successful_run_at ?? startedAt);
            continue;
          }

          const written = await this.persist(records);
          summary.resourcesProcessed += 1;
          summary.bronzeRowsWritten += written.bronzeRowsWritten;
          summary.eventsWritten += written.eventsWritten;
          summary.entityLinksWritten += written.entityLinksWritten;
          summary.metricsWritten += written.metricsWritten;
          summary.recordsInserted += written.recordsInserted;
          summary.recordsUpdated += written.recordsUpdated;
          summary.recordsUnchanged += written.recordsUnchanged;
          processedFingerprints.push(fingerprint(resource));
          await this.saveCheckpoint(datasetCode, source?.id ?? null, resource, hash, 'completed', records.length, written.eventsWritten, startedAt);
        } catch (error) {
          summary.errors.push(`${resource.name}: ${message(error)}`);
          await this.saveCheckpoint(datasetCode, source?.id ?? null, resource, null, 'failed', 0, 0, checkpoint?.last_successful_run_at ?? null);
        }
      }

      if (summary.resourcesProcessed || summary.resourcesSkipped) {
        try {
          summary.signalsWritten = Number(await this.client!.rpc<number>('sync_capital_market_company_signals', { p_dataset_code: datasetCode }) ?? 0);
        } catch (error) {
          summary.errors.push(`signal sync: ${message(error)}`);
        }
      }
    } catch (error) {
      summary.errors.push(message(error));
    }

    summary.status = capitalMarketRunStatus(summary);
    const finishedAt = new Date().toISOString();
    await this.client!.update('capital_market_dataset_runs', {
      status: summary.status,
      finished_at: finishedAt,
      files_processed: summary.resourcesProcessed,
      resources_skipped: summary.resourcesSkipped,
      records_seen: summary.recordsSeen,
      bronze_rows_written: summary.bronzeRowsWritten,
      events_written: summary.eventsWritten,
      entity_links_written: summary.entityLinksWritten,
      metrics_written: summary.metricsWritten,
      records_inserted: summary.recordsInserted,
      records_updated: summary.recordsUpdated,
      records_unchanged: summary.recordsUnchanged,
      signals_written: summary.signalsWritten,
      error_message: summary.errors.join(' | ') || null,
      metadata: {
        reference: options.reference ?? null,
        maxRows: options.maxRows,
        packageId: definition.packageId,
        resourceFingerprints: processedFingerprints,
        skippedResourceFingerprints: skippedFingerprints,
        effectivePersistenceBatchSize: this.persistenceBatchSize,
      },
      updated_at: finishedAt,
    }, [{ column: 'id', value: runId }]);

    if (source) {
      await this.client!.update('source_catalog', {
        status: summary.status === 'completed' ? 'real' : 'partial',
        health: summary.status === 'completed' ? 'healthy' : 'degraded',
        metadata: {
          ...(source.metadata ?? {}),
          lastIngestion: {
            datasetCode,
            status: summary.status,
            finishedAt,
            recordsSeen: summary.recordsSeen,
            resourcesProcessed: summary.resourcesProcessed,
            resourcesSkipped: summary.resourcesSkipped,
            signalsWritten: summary.signalsWritten,
            effectivePersistenceBatchSize: this.persistenceBatchSize,
            errors: summary.errors.slice(0, 10),
          },
        },
        updated_at: finishedAt,
      }, [{ column: 'id', value: source.id }]);
    }
    return summary;
  }

  private async saveCheckpoint(
    datasetCode: CvmDatasetCode,
    sourceId: string | null,
    resource: CvmResource,
    contentHash: string | null,
    status: 'completed' | 'failed',
    recordsSeen: number,
    recordsWritten: number,
    lastSuccessfulRunAt: string | null,
  ) {
    const now = new Date().toISOString();
    await this.client!.upsert('capital_market_resource_checkpoints', [{
      dataset_code: datasetCode,
      source_id: sourceId,
      resource_key: resourceKey(resource),
      resource_url: resource.url,
      resource_name: resource.name,
      resource_modified_at: timestamp(resource.last_modified ?? resource.created),
      content_hash: contentHash,
      status,
      records_seen: recordsSeen,
      records_written: recordsWritten,
      last_attempted_at: now,
      last_successful_run_at: lastSuccessfulRunAt,
      error_message: status === 'failed' ? `Failed to process ${resource.name}.` : null,
      updated_at: now,
    }], 'dataset_code,resource_key');
  }

  private async persist(records: NormalizedCapitalMarketRecord[]) {
    const persisted = await persistCapitalMarketRecordsAdaptive(
      records,
      async (batch) => {
        const result = await this.client!.rpc<BatchPersistResult>('persist_capital_market_batch', {
          p_records: serializeCapitalMarketBatch(batch),
        });
        if (!result) throw new Error('persist_capital_market_batch returned no result.');
        return result;
      },
      this.persistenceBatchSize,
    );

    this.persistenceBatchSize = persisted.effectiveBatchSize;
    const { effectiveBatchSize: _effectiveBatchSize, timeoutSplits: _timeoutSplits, ...totals } = persisted;
    return totals;
  }
}
