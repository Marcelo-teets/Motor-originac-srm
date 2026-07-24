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

// Record keys are SHA-256 strings sent through a PostgREST `in` filter before
// each idempotent upsert. Seventy-five rows keeps the encoded query comfortably
// below common proxy URL limits while reducing round trips by ~47% versus 40.
const DEFAULT_BATCH_SIZE = 75;
const DEFAULT_MAX_ROWS = 50_000;
const STALE_RUN_AFTER_MS = 30 * 60 * 1_000;
const ALL_DATASETS = Object.keys(CVM_DATASETS) as CvmDatasetCode[];

const chunks = <T>(items: T[], size = DEFAULT_BATCH_SIZE) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const isConcurrentRunConflict = (error: unknown) => {
  const message = errorMessage(error);
  return message.includes('uq_capital_market_dataset_single_running')
    || message.includes('duplicate key value violates unique constraint')
    || message.includes('23505');
};
const resourceFingerprint = (resource: CvmResource) => [
  resource.id ?? resource.url,
  resource.last_modified ?? resource.created ?? 'unknown',
  resource.url,
].join('|');
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

type DatasetRunRow = {
  metadata?: {
    resourceFingerprints?: string[];
    skippedResourceFingerprints?: string[];
  };
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

const emptySummary = (
  datasetCode: CvmDatasetCode,
  status: CapitalMarketDatasetSummary['status'],
  error: string,
): CapitalMarketDatasetSummary => ({
  datasetCode,
  status,
  resourcesProcessed: 0,
  resourcesSkipped: 0,
  recordsSeen: 0,
  bronzeRowsWritten: 0,
  eventsWritten: 0,
  recordsInserted: 0,
  recordsUpdated: 0,
  recordsUnchanged: 0,
  signalsWritten: 0,
  errors: [error],
});

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

  private async previousResourceFingerprints(datasetCode: CvmDatasetCode) {
    const rows = await this.client!.select('capital_market_dataset_runs', {
      select: 'metadata',
      orderBy: { column: 'started_at', ascending: false },
      limit: 20,
      filters: [
        { column: 'dataset_code', value: datasetCode },
        { column: 'status', operator: 'in', value: ['completed', 'partial'] },
      ],
    }) as DatasetRunRow[];

    return new Set(rows.flatMap((row) => [
      ...(row.metadata?.resourceFingerprints ?? []),
      ...(row.metadata?.skippedResourceFingerprints ?? []),
    ]));
  }

  private async acquireRun(input: {
    runId: string;
    datasetCode: CvmDatasetCode;
    sourceId: string | null;
    triggerType: 'manual' | 'schedule' | 'backfill';
    startedAt: string;
    reference?: string;
    maxRows: number;
    packageId: string;
  }) {
    const now = new Date().toISOString();
    const staleBefore = new Date(Date.now() - STALE_RUN_AFTER_MS).toISOString();
    await this.client!.update('capital_market_dataset_runs', {
      status: 'failed',
      finished_at: now,
      error_message: 'Automatically closed as a stale capital-market ingestion run.',
      updated_at: now,
    }, [
      { column: 'dataset_code', value: input.datasetCode },
      { column: 'status', value: 'running' },
      { column: 'started_at', operator: 'lt', value: staleBefore },
    ]);

    try {
      await this.client!.insert('capital_market_dataset_runs', [{
        id: input.runId,
        dataset_code: input.datasetCode,
        source_id: input.sourceId,
        trigger_type: input.triggerType,
        status: 'running',
        started_at: input.startedAt,
        metadata: {
          reference: input.reference ?? null,
          maxRows: input.maxRows,
          packageId: input.packageId,
        },
      }]);
      return true;
    } catch (error) {
      if (isConcurrentRunConflict(error)) return false;
      throw error;
    }
  }

  private async runDataset(
    datasetCode: CvmDatasetCode,
    options: { reference?: string; maxRows: number; triggerType: 'manual' | 'schedule' | 'backfill' },
  ): Promise<CapitalMarketDatasetSummary> {
    const definition = CVM_DATASETS[datasetCode];
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const errors: string[] = [];
    const processedFingerprints: string[] = [];
    const skippedFingerprints: string[] = [];
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
    const acquired = await this.acquireRun({
      runId,
      datasetCode,
      sourceId,
      triggerType: options.triggerType,
      startedAt,
      reference: options.reference,
      maxRows: options.maxRows,
      packageId: definition.packageId,
    });

    if (!acquired) {
      return emptySummary(datasetCode, 'partial', `Another ${datasetCode} ingestion is already running.`);
    }

    const checkpointRows = await this.client!.select('capital_market_resource_checkpoints', {
      select: 'resource_key,resource_modified_at,content_hash,status,last_successful_run_at',
      limit: 1_000,
      filters: [{ column: 'dataset_code', value: datasetCode }],
    }) as ResourceCheckpoint[];
    const checkpoints = new Map(checkpointRows.map((row) => [row.resource_key, row]));
    const incremental = options.triggerType === 'schedule' && !options.reference;

    try {
      const resources = await discoverCvmResources(datasetCode, options.reference);
      const previousFingerprints = incremental ? await this.previousResourceFingerprints(datasetCode) : new Set<string>();
      const resourcesToProcess: Array<{ resource: CvmResource; fingerprint: string; checkpoint?: ResourceCheckpoint }> = [];

      for (const resource of resources) {
        const fingerprint = resourceFingerprint(resource);
        const checkpoint = checkpoints.get(resourceKey(resource));
        const unchangedByCheckpoint = shouldSkipCapitalMarketResource({ ...options, resource, checkpoint });
        const unchangedByLegacyFingerprint = incremental && !checkpoint && previousFingerprints.has(fingerprint);

        if (unchangedByCheckpoint || unchangedByLegacyFingerprint) {
          resourcesSkipped += 1;
          skippedFingerprints.push(fingerprint);
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
        } else {
          resourcesToProcess.push({ resource, fingerprint, checkpoint });
        }
      }

      const perResourceBudget = resourcesToProcess.length
        ? Math.max(1, Math.floor(options.maxRows / resourcesToProcess.length))
        : 0;

      for (let index = 0; index < resourcesToProcess.length; index += 1) {
        const { resource, fingerprint, checkpoint } = resourcesToProcess[index];
        const remaining = options.maxRows - recordsSeen;
        if (remaining <= 0) break;
        const isLast = index === resourcesToProcess.length - 1;
        const maxRows = isLast ? remaining : Math.min(remaining, perResourceBudget);

        try {
          const records = await fetchCvmResourceRecords({ datasetCode, resource, maxRows, observedAt: startedAt });
          recordsSeen += records.length;
          const aggregateHash = recordsHash(records);

          if (incremental && checkpoint?.status === 'completed' && checkpoint.content_hash === aggregateHash) {
            resourcesSkipped += 1;
            recordsUnchanged += records.length;
            skippedFingerprints.push(fingerprint);
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
          processedFingerprints.push(fingerprint);
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
            contentHash: null,
            status: 'failed',
            recordsSeen: 0,
            recordsWritten: 0,
            lastSuccessfulRunAt: checkpoint?.last_successful_run_at ?? null,
          });
        }
      }

      if (resourcesProcessed || resourcesSkipped) {
        try {
          const synced = await this.client!.rpc<number>('sync_capital_market_company_signals', { p_dataset_code: datasetCode });
          signalsWritten = Number(synced ?? 0);
        } catch (error) {
          errors.push(`signal sync: ${errorMessage(error)}`);
        }
      }
    } catch (error) {
      errors.push(errorMessage(error));
    }

    const status: CapitalMarketDatasetSummary['status'] = resourcesProcessed > 0 && errors.length === 0
      ? 'completed'
      : resourcesProcessed > 0 || resourcesSkipped > 0 || recordsSeen > 0
        ? 'partial'
        : 'failed';
    const finishedAt = new Date().toISOString();
    await this.client!.update('capital_market_dataset_runs', {
      status,
      finished_at: finishedAt,
      files_processed: resourcesProcessed,
      records_seen: recordsSeen,
      bronze_rows_written: bronzeRowsWritten,
      events_written: eventsWritten,
      records_inserted: recordsInserted,
      records_updated: recordsUpdated,
      records_unchanged: recordsUnchanged,
      signals_written: signalsWritten,
      error_message: errors.join(' | ') || null,
      metadata: {
        reference: options.reference ?? null,
        maxRows: options.maxRows,
        packageId: definition.packageId,
        resourceFingerprints: processedFingerprints,
        skippedResourceFingerprints: skippedFingerprints,
      },
      updated_at: finishedAt,
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
  }) {
    const now = new Date().toISOString();
    await this.client!.upsert('capital_market_resource_checkpoints', [{
      dataset_code: input.datasetCode,
      source_id: input.sourceId,
      resource_key: resourceKey(input.resource),
      resource_url: input.resource.url,
      resource_name: input.resource.name,
      resource_modified_at: normalizedTimestamp(input.resource.last_modified ?? input.resource.created),
      content_hash: input.contentHash,
      status: input.status,
      records_seen: input.recordsSeen,
      records_written: input.recordsWritten,
      last_attempted_at: now,
      last_successful_run_at: input.lastSuccessfulRunAt,
      error_message: input.status === 'failed' ? `Failed to process ${input.resource.name}.` : null,
      updated_at: now,
    }], 'dataset_code,resource_key');
  }

  private async persistRecords(records: NormalizedCapitalMarketRecord[]) {
    let bronzeRowsWritten = 0;
    let eventsWritten = 0;
    let recordsInserted = 0;
    let recordsUpdated = 0;
    let recordsUnchanged = 0;

    for (const batch of chunks(records)) {
      const keys = batch.map((record) => record.event.record_key);
      const datasetCodes = [...new Set(batch.map((record) => record.event.dataset_code))];
      const [existingBronze, existingEvents] = await Promise.all([
        this.client!.select('bronze_historical_records', {
          select: 'dataset_code,record_key,content_hash',
          limit: Math.max(100, batch.length * 2),
          filters: [
            { column: 'dataset_code', operator: 'in', value: datasetCodes },
            { column: 'record_key', operator: 'in', value: keys },
          ],
        }) as Promise<Array<{ dataset_code: string; record_key: string; content_hash: string | null }>>,
        this.client!.select('capital_market_events', {
          select: 'dataset_code,record_key,content_hash',
          limit: Math.max(100, batch.length * 2),
          filters: [
            { column: 'dataset_code', operator: 'in', value: datasetCodes },
            { column: 'record_key', operator: 'in', value: keys },
          ],
        }) as Promise<Array<{ dataset_code: string; record_key: string; content_hash: string | null }>>,
      ]);
      const bronzeByKey = new Map(existingBronze.map((row) => [`${row.dataset_code}:${row.record_key}`, row.content_hash]));
      const eventByKey = new Map(existingEvents.map((row) => [`${row.dataset_code}:${row.record_key}`, row.content_hash]));
      const changed = batch.filter((record) => {
        const key = `${record.event.dataset_code}:${record.event.record_key}`;
        return bronzeByKey.get(key) !== record.event.content_hash || eventByKey.get(key) !== record.event.content_hash;
      });

      recordsUnchanged += batch.length - changed.length;
      recordsInserted += changed.filter((record) => {
        const key = `${record.event.dataset_code}:${record.event.record_key}`;
        return !bronzeByKey.has(key) && !eventByKey.has(key);
      }).length;
      recordsUpdated += changed.filter((record) => {
        const key = `${record.event.dataset_code}:${record.event.record_key}`;
        return bronzeByKey.has(key) || eventByKey.has(key);
      }).length;

      if (!changed.length) continue;
      const [bronzeWritten, eventsPersisted] = await Promise.all([
        this.client!.upsert('bronze_historical_records', changed.map((record) => record.bronze), 'dataset_code,record_key'),
        this.client!.upsert('capital_market_events', changed.map((record) => record.event), 'dataset_code,record_key'),
      ]);
      bronzeRowsWritten += Array.isArray(bronzeWritten) ? bronzeWritten.length : changed.length;
      eventsWritten += Array.isArray(eventsPersisted) ? eventsPersisted.length : changed.length;
    }

    return {
      bronzeRowsWritten,
      eventsWritten,
      recordsInserted,
      recordsUpdated,
      recordsUnchanged,
    };
  }
}