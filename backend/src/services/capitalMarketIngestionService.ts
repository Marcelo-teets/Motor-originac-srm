import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import {
  CVM_DATASETS,
  discoverCvmResources,
  fetchCvmResourceRecords,
  type CvmDatasetCode,
  type CvmResource,
  type NormalizedCapitalMarketRecord,
} from '../modules/capital-markets/cvmCapitalMarketConnector.js';

const DEFAULT_BATCH_SIZE = 40;
const DEFAULT_MAX_ROWS = 50_000;
const ALL_DATASETS = Object.keys(CVM_DATASETS) as CvmDatasetCode[];

const chunks = <T>(items: T[], size = DEFAULT_BATCH_SIZE) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const resourceKey = (resource: CvmResource) => resource.id?.trim() || resource.url;
const normalizedTimestamp = (value: string | null | undefined) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};
const recordsHash = (records: NormalizedCapitalMarketRecord[]) => createHash('sha256')
  .update(records.map((record) => record.event.content_hash).sort().join('|'))
  .digest('hex');

export type CapitalMarketIngestionOptions = {
  datasets?: CvmDatasetCode[];
  reference?: string;
  maxRows?: number;
  triggerType?: 'manual' | 'schedule' | 'backfill';
};

type ResourceCheckpoint = {
  resource_key: string;
  resource_modified_at: string | null;
  content_hash: string | null;
  status: 'completed' | 'partial' | 'failed';
  last_successful_run_at: string | null;
};

export type CapitalMarketDatasetSummary = {
  datasetCode: CvmDatasetCode;
  status: 'completed' | 'partial' | 'failed';
  resourcesProcessed: number;
  resourcesSkipped: number;
  recordsSeen: number;
  bronzeRowsWritten: number;
  eventsWritten: number;
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
  checkpoint?: ResourceCheckpoint;
}) => {
  if (input.triggerType !== 'schedule' || input.reference || input.checkpoint?.status !== 'completed') return false;
  const modifiedAt = normalizedTimestamp(input.resource.last_modified ?? input.resource.created);
  return Boolean(modifiedAt && input.checkpoint.resource_modified_at === modifiedAt);
};

export class CapitalMarketIngestionService {
  private readonly client = getSupabaseClient();

  async run(options: CapitalMarketIngestionOptions = {}) {
    if (!this.client) throw new Error('Supabase client not configured for capital-market ingestion.');
    const datasets = options.datasets?.length ? [...new Set(options.datasets)] : ALL_DATASETS;
    const maxRows = Math.max(1, Math.min(options.maxRows ?? DEFAULT_MAX_ROWS, 500_000));
    const summaries: CapitalMarketDatasetSummary[] = [];

    for (const datasetCode of datasets) {
      summaries.push(await this.runDataset(datasetCode, {
        reference: options.reference,
        maxRows,
        triggerType: options.triggerType ?? 'manual',
      }));
    }

    return {
      status: summaries.every((summary) => summary.status === 'completed')
        ? 'real'
        : summaries.some((summary) => summary.status === 'completed' || summary.status === 'partial')
          ? 'partial'
          : 'failed',
      generatedAt: new Date().toISOString(),
      requested: { datasets, reference: options.reference ?? null, maxRows },
      totals: {
        resourcesProcessed: summaries.reduce((sum, item) => sum + item.resourcesProcessed, 0),
        resourcesSkipped: summaries.reduce((sum, item) => sum + item.resourcesSkipped, 0),
        recordsSeen: summaries.reduce((sum, item) => sum + item.recordsSeen, 0),
        bronzeRowsWritten: summaries.reduce((sum, item) => sum + item.bronzeRowsWritten, 0),
        eventsWritten: summaries.reduce((sum, item) => sum + item.eventsWritten, 0),
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
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const errors: string[] = [];
    let resourcesProcessed = 0;
    let resourcesSkipped = 0;
    let recordsSeen = 0;
    let bronzeRowsWritten = 0;
    let eventsWritten = 0;
    let recordsInserted = 0;
    let recordsUpdated = 0;
    let recordsUnchanged = 0;
    let signalsWritten = 0;

    const sourceRows = await this.client!.select('source_catalog', { select: 'id,name,metadata', limit: 1_000 }) as Array<{
      id: string;
      name: string;
      metadata?: Record<string, unknown>;
    }>;
    const sourceId = sourceRows.find((row) => row.metadata?.code === definition.sourceCode)?.id ?? null;
    const checkpointRows = await this.client!.select('capital_market_resource_checkpoints', {
      select: 'resource_key,resource_modified_at,content_hash,status,last_successful_run_at',
      limit: 1_000,
      filters: [{ column: 'dataset_code', value: datasetCode }],
    }) as ResourceCheckpoint[];
    const checkpoints = new Map(checkpointRows.map((row) => [row.resource_key, row]));

    await this.client!.insert('capital_market_dataset_runs', [{
      id: runId,
      dataset_code: datasetCode,
      source_id: sourceId,
      trigger_type: options.triggerType,
      status: 'running',
      started_at: startedAt,
      metadata: { reference: options.reference ?? null, maxRows: options.maxRows, packageId: definition.packageId },
    }]);

    try {
      const resources = await discoverCvmResources(datasetCode, options.reference);
      for (const resource of resources) {
        const remaining = options.maxRows - recordsSeen;
        if (remaining <= 0) break;
        const key = resourceKey(resource);
        const checkpoint = checkpoints.get(key);

        if (shouldSkipCapitalMarketResource({ ...options, resource, checkpoint })) {
          resourcesSkipped += 1;
          await this.saveCheckpoint({
            datasetCode,
            sourceId,
            resource,
            contentHash: checkpoint?.content_hash ?? null,
            status: 'completed',
            recordsSeen: 0,
            recordsWritten: 0,
            lastSuccessfulRunAt: checkpoint?.last_successful_run_at ?? startedAt,
          });
          continue;
        }

        try {
          const records = await fetchCvmResourceRecords({ datasetCode, resource, maxRows: remaining, observedAt: startedAt });
          recordsSeen += records.length;
          const aggregateHash = recordsHash(records);

          if (options.triggerType === 'schedule' && !options.reference && checkpoint?.status === 'completed' && checkpoint.content_hash === aggregateHash) {
            resourcesSkipped += 1;
            recordsUnchanged += records.length;
            await this.saveCheckpoint({
              datasetCode,
              sourceId,
              resource,
              contentHash: aggregateHash,
              status: 'completed',
              recordsSeen: records.length,
              recordsWritten: 0,
              lastSuccessfulRunAt: checkpoint.last_successful_run_at ?? startedAt,
            });
            continue;
          }

          const persisted = await this.persistRecords(records);
          resourcesProcessed += 1;
          bronzeRowsWritten += persisted.bronzeRowsWritten;
          eventsWritten += persisted.eventsWritten;
          recordsInserted += persisted.recordsInserted;
          recordsUpdated += persisted.recordsUpdated;
          recordsUnchanged += persisted.recordsUnchanged;

          await this.saveCheckpoint({
            datasetCode,
            sourceId,
            resource,
            contentHash: aggregateHash,
            status: 'completed',
            recordsSeen: records.length,
            recordsWritten: persisted.eventsWritten,
            lastSuccessfulRunAt: startedAt,
          });
        } catch (error) {
          const message = `${resource.name}: ${errorMessage(error)}`;
          errors.push(message);
          await this.saveCheckpoint({
            datasetCode,
            sourceId,
            resource,
            contentHash: checkpoint?.content_hash ?? null,
            status: 'failed',
            recordsSeen: 0,
            recordsWritten: 0,
            lastSuccessfulRunAt: checkpoint?.last_successful_run_at ?? null,
            error: message,
          }).catch(() => undefined);
        }
      }

      if (eventsWritten > 0) {
        try {
          const result = await this.client!.rpc<number>('sync_capital_market_company_signals', { p_dataset_code: datasetCode });
          signalsWritten = Number(result ?? 0);
        } catch (error) {
          errors.push(`signal_sync: ${errorMessage(error)}`);
        }
      }
    } catch (error) {
      errors.push(errorMessage(error));
    }

    const touchedResources = resourcesProcessed + resourcesSkipped;
    const status: CapitalMarketDatasetSummary['status'] = errors.length
      ? touchedResources > 0 ? 'partial' : 'failed'
      : 'completed';

    await this.client!.update('capital_market_dataset_runs', {
      status,
      finished_at: new Date().toISOString(),
      files_processed: resourcesProcessed,
      resources_skipped: resourcesSkipped,
      records_seen: recordsSeen,
      bronze_rows_written: bronzeRowsWritten,
      events_written: eventsWritten,
      records_inserted: recordsInserted,
      records_updated: recordsUpdated,
      records_unchanged: recordsUnchanged,
      signals_written: signalsWritten,
      error_message: errors.length ? errors.slice(0, 10).join(' | ') : null,
      metadata: {
        reference: options.reference ?? null,
        maxRows: options.maxRows,
        packageId: definition.packageId,
        sourceCode: definition.sourceCode,
        resourcesProcessed,
        resourcesSkipped,
        recordsInserted,
        recordsUpdated,
        recordsUnchanged,
        errors,
      },
    }, [{ column: 'id', value: runId }]);

    return {
      datasetCode,
      status,
      resourcesProcessed,
      resourcesSkipped,
      recordsSeen,
      bronzeRowsWritten,
      eventsWritten,
      recordsInserted,
      recordsUpdated,
      recordsUnchanged,
      signalsWritten,
      errors,
    };
  }

  private async saveCheckpoint(input: {
    datasetCode: CvmDatasetCode;
    sourceId: string | null;
    resource: CvmResource;
    contentHash: string | null;
    status: 'completed' | 'partial' | 'failed';
    recordsSeen: number;
    recordsWritten: number;
    lastSuccessfulRunAt: string | null;
    error?: string;
  }) {
    const checkedAt = new Date().toISOString();
    await this.client!.upsert('capital_market_resource_checkpoints', [{
      dataset_code: input.datasetCode,
      source_id: input.sourceId,
      resource_key: resourceKey(input.resource),
      resource_name: input.resource.name,
      resource_url: input.resource.url,
      resource_modified_at: normalizedTimestamp(input.resource.last_modified ?? input.resource.created),
      content_hash: input.contentHash,
      status: input.status,
      last_successful_run_at: input.lastSuccessfulRunAt,
      last_checked_at: checkedAt,
      records_seen: input.recordsSeen,
      records_written: input.recordsWritten,
      error_message: input.error ?? null,
      metadata: {
        resourceId: input.resource.id ?? null,
        format: input.resource.format ?? null,
        createdAt: input.resource.created ?? null,
        modifiedAt: input.resource.last_modified ?? null,
      },
      updated_at: checkedAt,
    }], 'dataset_code,resource_key');
  }

  private async persistRecords(records: NormalizedCapitalMarketRecord[]) {
    let bronzeRowsWritten = 0;
    let eventsWritten = 0;
    let recordsInserted = 0;
    let recordsUpdated = 0;
    let recordsUnchanged = 0;

    for (const batch of chunks(records)) {
      if (!batch.length) continue;
      const existingRows = await this.client!.select('capital_market_events', {
        select: 'record_key,content_hash',
        limit: batch.length,
        filters: [
          { column: 'dataset_code', value: batch[0].event.dataset_code },
          { column: 'record_key', operator: 'in', value: batch.map((record) => record.event.record_key) },
        ],
      }) as Array<{ record_key: string; content_hash: string | null }>;
      const existing = new Map(existingRows.map((row) => [row.record_key, row.content_hash]));
      const changed: NormalizedCapitalMarketRecord[] = [];

      for (const record of batch) {
        const previousHash = existing.get(record.event.record_key);
        if (previousHash === undefined) {
          recordsInserted += 1;
          changed.push(record);
        } else if (previousHash !== record.event.content_hash) {
          recordsUpdated += 1;
          changed.push(record);
        } else {
          recordsUnchanged += 1;
        }
      }

      if (!changed.length) continue;
      await this.client!.upsert('bronze_historical_records', changed.map((record) => record.bronze), 'dataset_code,record_key');
      bronzeRowsWritten += changed.length;
      await this.client!.upsert('capital_market_events', changed.map((record) => record.event), 'dataset_code,record_key');
      eventsWritten += changed.length;
    }

    return { bronzeRowsWritten, eventsWritten, recordsInserted, recordsUpdated, recordsUnchanged };
  }
}
