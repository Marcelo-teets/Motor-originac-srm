import { createHash, randomUUID } from 'node:crypto';
import type { getDataClient } from '../lib/dataClient.js';
import type { PublicBulkResource } from '../modules/public-data/publicBulkDatasetConnector.js';

/**
 * Shared runner for the checkpointed public-dataset loaders (public bulk and
 * strategic public sources). Both services used to carry a ~350-line copy of
 * this flow; they now only provide an adapter with what actually differs:
 * discovery/streaming connector, target-company policy, outputs sync and
 * metadata labels.
 */

export type DataClient = NonNullable<ReturnType<typeof getDataClient>>;
export type IngestionTrigger = 'manual' | 'schedule' | 'backfill';

export type PublicDatasetRecord = {
  datasetCode: string;
  sourceCode: string;
  recordKey: string;
  entityCnpj: string;
  entityName: string | null;
  recordType: string;
  referenceDate: string | null;
  amount: number | null;
  status: string | null;
  sourceUrl: string;
  resourceKey: string;
  contentHash: string;
  rawPayload: Record<string, string>;
  normalizedPayload: Record<string, unknown>;
};

export type PublicDatasetIngestionOptions<TCode extends string> = {
  datasets: TCode[];
  reference?: string;
  maxMatchedRows?: number;
  maxResources?: number;
  triggerType?: IngestionTrigger;
  discoverOnly?: boolean;
  fullCoverage?: boolean;
};

export type DatasetRunOptions = {
  reference?: string;
  maxMatchedRows: number;
  maxResources: number;
  triggerType: IngestionTrigger;
  discoverOnly: boolean;
  fullCoverage: boolean;
};

export type IngestionSummary<TCode extends string> = {
  datasetCode: TCode;
  status: 'completed' | 'partial' | 'failed' | 'discovered';
  resourcesDiscovered: number;
  resourcesProcessed: number;
  resourcesSkipped: number;
  rowsScanned: number;
  recordsMatched: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  bronzeRowsWritten: number;
  normalizedRowsWritten: number;
  outputsWritten: number;
  signalsWritten: number;
  errors: string[];
  resources?: PublicBulkResource[];
};

export type PublicDatasetIngestionAdapter<TCode extends string, TRecord extends PublicDatasetRecord> = {
  /** Error recorded when no persistent data client is configured. */
  missingClientMessage: string;
  /** Error recorded when the target policy yields no company. */
  noTargetsMessage: string;
  /** `implementationPhase` written to source_catalog while coverage is partial. */
  partialImplementationPhase: string;
  /** Extra metadata merged into run, checkpoint and source rows (labels only). */
  runMetadata?: Record<string, unknown>;
  checkpointMetadata?: Record<string, unknown>;
  sourceMetadata?: (targetCompanyCount: number) => Record<string, unknown>;
  sourceCodeFor: (datasetCode: TCode) => string;
  discover: (datasetCode: TCode, options: { reference?: string; maxResources: number }) => Promise<PublicBulkResource[]>;
  stream: (input: {
    datasetCode: TCode;
    resource: PublicBulkResource;
    targetCnpjs: Set<string>;
    targetRoots: Set<string>;
    maxMatchedRows: number;
    onRecord: (record: TRecord) => Promise<void>;
  }) => Promise<{ rowsScanned: number; recordsMatched: number }>;
  /** 14-digit CNPJs of the companies this loader may match. */
  loadTargetCnpjs: (client: DataClient) => Promise<Set<string>>;
  syncOutputs: (client: DataClient, datasetCode: TCode) => Promise<{ outputsWritten: number; signalsWritten: number }>;
};

type SourceRow = { id: string; status: string; health: string; metadata?: Record<string, unknown> };
type CheckpointRow = {
  resource_key: string;
  resource_modified_at: string | null;
  etag: string | null;
  content_hash: string | null;
  status: string;
  last_successful_run_at: string | null;
};

const STALE_RUN_MS = 6 * 60 * 60 * 1_000;
const BATCH_SIZE = 100;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const blankIngestionSummary = <TCode extends string>(datasetCode: TCode): IngestionSummary<TCode> => ({
  datasetCode,
  status: 'failed',
  resourcesDiscovered: 0,
  resourcesProcessed: 0,
  resourcesSkipped: 0,
  rowsScanned: 0,
  recordsMatched: 0,
  recordsInserted: 0,
  recordsUpdated: 0,
  recordsUnchanged: 0,
  bronzeRowsWritten: 0,
  normalizedRowsWritten: 0,
  outputsWritten: 0,
  signalsWritten: 0,
  errors: [],
});

/** A scheduled run skips a resource whose etag/modified date match the last completed checkpoint. */
export const isUnchangedResource = (
  triggerType: IngestionTrigger,
  previous: Pick<CheckpointRow, 'status' | 'etag' | 'resource_modified_at'> | undefined,
  resource: Pick<PublicBulkResource, 'etag' | 'modifiedAt'>,
) => triggerType === 'schedule'
  && previous?.status === 'completed'
  && Boolean(resource.etag || resource.modifiedAt)
  && (!resource.etag || previous.etag === resource.etag)
  && (!resource.modifiedAt || previous.resource_modified_at === resource.modifiedAt);

export class PublicDatasetIngestionRunner<TCode extends string, TRecord extends PublicDatasetRecord> {
  constructor(
    private readonly client: DataClient | null,
    private readonly adapter: PublicDatasetIngestionAdapter<TCode, TRecord>,
  ) {}

  async run(options: PublicDatasetIngestionOptions<TCode>) {
    const datasets = [...new Set(options.datasets)];
    const limits = {
      maxMatchedRows: Math.max(1, Math.min(options.maxMatchedRows ?? 100_000, 1_000_000)),
      maxResources: Math.max(1, Math.min(options.maxResources ?? 20, 100)),
    };
    const summaries: IngestionSummary<TCode>[] = [];

    for (const datasetCode of datasets) {
      try {
        summaries.push(await this.runDataset(datasetCode, {
          ...limits,
          reference: options.reference,
          triggerType: options.triggerType ?? 'manual',
          discoverOnly: options.discoverOnly ?? false,
          fullCoverage: options.fullCoverage ?? false,
        }));
      } catch (error) {
        // One dataset failing (e.g. Company Master unreachable) must not discard
        // the summaries of the datasets already processed.
        const failed = blankIngestionSummary(datasetCode);
        failed.errors.push(`runtime: ${errorMessage(error)}`);
        summaries.push(failed);
      }
    }

    const sum = (key: keyof IngestionSummary<TCode>) => summaries.reduce((total, item) => total + Number(item[key] ?? 0), 0);
    return {
      status: summaries.every((item) => ['completed', 'discovered'].includes(item.status))
        ? 'real'
        : summaries.some((item) => item.status !== 'failed') ? 'partial' : 'failed',
      generatedAt: new Date().toISOString(),
      requested: { datasets, reference: options.reference ?? null, ...limits },
      totals: {
        resourcesDiscovered: sum('resourcesDiscovered'),
        resourcesProcessed: sum('resourcesProcessed'),
        resourcesSkipped: sum('resourcesSkipped'),
        rowsScanned: sum('rowsScanned'),
        recordsMatched: sum('recordsMatched'),
        recordsInserted: sum('recordsInserted'),
        recordsUpdated: sum('recordsUpdated'),
        recordsUnchanged: sum('recordsUnchanged'),
        outputsWritten: sum('outputsWritten'),
        signalsWritten: sum('signalsWritten'),
      },
      datasets: summaries,
    };
  }

  private async runDataset(datasetCode: TCode, options: DatasetRunOptions): Promise<IngestionSummary<TCode>> {
    const summary = blankIngestionSummary(datasetCode);
    let resources: PublicBulkResource[];
    try {
      resources = await this.adapter.discover(datasetCode, options);
      summary.resourcesDiscovered = resources.length;
      if (options.discoverOnly) {
        summary.status = 'discovered';
        summary.resources = resources;
        return summary;
      }
    } catch (error) {
      summary.errors.push(`discovery: ${errorMessage(error)}`);
      return summary;
    }

    const client = this.client;
    if (!client) {
      summary.errors.push(this.adapter.missingClientMessage);
      return summary;
    }

    const targetCnpjs = await this.adapter.loadTargetCnpjs(client);
    const targetRoots = new Set([...targetCnpjs].map((cnpj) => cnpj.slice(0, 8)));
    if (!targetCnpjs.size) {
      summary.errors.push(this.adapter.noTargetsMessage);
      return summary;
    }

    const sourceCode = this.adapter.sourceCodeFor(datasetCode);
    const sources = await client.select('source_catalog', { select: 'id,status,health,metadata', limit: 1_000 }) as SourceRow[];
    const source = sources.find((row) => row.metadata?.code === sourceCode);
    if (!source) {
      summary.errors.push(`Source catalog entry not found: ${sourceCode}.`);
      return summary;
    }

    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    await this.closeStaleRuns(client, datasetCode, startedAt);
    try {
      await client.insert('public_dataset_runs', [{
        id: runId,
        dataset_code: datasetCode,
        source_id: source.id,
        trigger_type: options.triggerType,
        status: 'running',
        started_at: startedAt,
        metadata: {
          reference: options.reference ?? null,
          maxMatchedRows: options.maxMatchedRows,
          maxResources: options.maxResources,
          targetCompanyCount: targetCnpjs.size,
          fullCoverageRequested: options.fullCoverage,
          ...this.adapter.runMetadata,
        },
      }]);
    } catch (error) {
      summary.status = 'partial';
      summary.errors.push(`run_lock: ${errorMessage(error)}`);
      return summary;
    }

    try {
      await this.processResources(client, datasetCode, source.id, resources, targetCnpjs, targetRoots, options, startedAt, summary);
    } catch (error) {
      // Previously an unexpected error here escaped before the run row was
      // finalized, leaving it `running` (and the dataset locked) for 6 hours.
      summary.errors.push(`runtime: ${errorMessage(error)}`);
    }

    if (summary.normalizedRowsWritten > 0 || summary.recordsUnchanged > 0) {
      try {
        const synced = await this.adapter.syncOutputs(client, datasetCode);
        summary.outputsWritten = synced.outputsWritten;
        summary.signalsWritten = synced.signalsWritten;
      } catch (error) {
        summary.errors.push(`signal_sync: ${errorMessage(error)}`);
      }
    }

    const successful = summary.resourcesProcessed > 0 || summary.resourcesSkipped > 0;
    summary.status = !successful ? 'failed' : summary.errors.length ? 'partial' : 'completed';
    const finishedAt = new Date().toISOString();
    await client.update('public_dataset_runs', {
      status: summary.status,
      finished_at: finishedAt,
      resources_discovered: summary.resourcesDiscovered,
      resources_processed: summary.resourcesProcessed,
      resources_skipped: summary.resourcesSkipped,
      rows_scanned: summary.rowsScanned,
      records_matched: summary.recordsMatched,
      bronze_rows_written: summary.bronzeRowsWritten,
      normalized_rows_written: summary.normalizedRowsWritten,
      outputs_written: summary.outputsWritten,
      signals_written: summary.signalsWritten,
      error_message: summary.errors.length ? summary.errors.slice(0, 10).join(' | ') : null,
      metadata: {
        reference: options.reference ?? null,
        targetCompanyCount: targetCnpjs.size,
        ...this.adapter.runMetadata,
        errors: summary.errors,
      },
      updated_at: finishedAt,
    }, [{ column: 'id', value: runId }]);

    const fullCoverage = options.fullCoverage
      && summary.status === 'completed'
      && summary.resourcesProcessed + summary.resourcesSkipped === summary.resourcesDiscovered;
    await client.update('source_catalog', {
      status: fullCoverage ? 'real' : source.status,
      health: summary.status === 'failed' ? 'degraded' : 'healthy',
      metadata: {
        ...(source.metadata ?? {}),
        implementedRuntime: true,
        implementationPhase: fullCoverage ? 'runtime_active' : this.adapter.partialImplementationPhase,
        ...this.adapter.sourceMetadata?.(targetCnpjs.size),
        lastLoaderRunAt: finishedAt,
        lastLoaderStatus: summary.status,
        lastRowsScanned: summary.rowsScanned,
        lastRecordsMatched: summary.recordsMatched,
        fullCoverageAchieved: fullCoverage,
      },
      updated_at: finishedAt,
    }, [{ column: 'id', value: source.id }]);

    return summary;
  }

  private async processResources(
    client: DataClient,
    datasetCode: TCode,
    sourceId: string,
    resources: PublicBulkResource[],
    targetCnpjs: Set<string>,
    targetRoots: Set<string>,
    options: DatasetRunOptions,
    startedAt: string,
    summary: IngestionSummary<TCode>,
  ) {
    const checkpointRows = await client.select('public_dataset_resource_checkpoints', {
      select: 'resource_key,resource_modified_at,etag,content_hash,status,last_successful_run_at',
      limit: 1_000,
      filters: [{ column: 'dataset_code', value: datasetCode }],
    }) as CheckpointRow[];
    const checkpoints = new Map(checkpointRows.map((row) => [row.resource_key, row]));

    for (const resource of resources) {
      if (summary.recordsMatched >= options.maxMatchedRows) break;
      const previous = checkpoints.get(resource.key);
      if (isUnchangedResource(options.triggerType, previous, resource)) {
        summary.resourcesSkipped += 1;
        continue;
      }

      const aggregateHash = createHash('sha256');
      let pending: TRecord[] = [];
      const flush = async () => {
        if (!pending.length) return;
        const result = await this.persistBatch(client, pending);
        summary.recordsInserted += result.inserted;
        summary.recordsUpdated += result.updated;
        summary.recordsUnchanged += result.unchanged;
        summary.bronzeRowsWritten += result.written;
        summary.normalizedRowsWritten += result.written;
        pending = [];
      };

      try {
        const stats = await this.adapter.stream({
          datasetCode,
          resource,
          targetCnpjs,
          targetRoots,
          maxMatchedRows: options.maxMatchedRows - summary.recordsMatched,
          onRecord: async (record) => {
            aggregateHash.update(record.contentHash);
            pending.push(record);
            if (pending.length >= BATCH_SIZE) await flush();
          },
        });
        await flush();
        summary.resourcesProcessed += 1;
        summary.rowsScanned += stats.rowsScanned;
        summary.recordsMatched += stats.recordsMatched;
        await this.saveCheckpoint(client, datasetCode, sourceId, resource, {
          status: 'completed',
          contentHash: aggregateHash.digest('hex'),
          rowsScanned: stats.rowsScanned,
          recordsMatched: stats.recordsMatched,
          lastSuccessfulRunAt: startedAt,
        });
      } catch (error) {
        const message = `${resource.name}: ${errorMessage(error)}`;
        summary.errors.push(message);
        await this.saveCheckpoint(client, datasetCode, sourceId, resource, {
          status: 'failed',
          contentHash: previous?.content_hash ?? null,
          rowsScanned: 0,
          recordsMatched: 0,
          lastSuccessfulRunAt: previous?.last_successful_run_at ?? null,
          error: message,
        }).catch(() => undefined);
      }
    }
  }

  private async closeStaleRuns(client: DataClient, datasetCode: string, now: string) {
    const staleBefore = new Date(Date.now() - STALE_RUN_MS).toISOString();
    await client.update('public_dataset_runs', {
      status: 'failed',
      finished_at: now,
      error_message: 'Automatically closed as stale.',
      updated_at: now,
    }, [
      { column: 'dataset_code', value: datasetCode },
      { column: 'status', value: 'running' },
      { column: 'started_at', operator: 'lt', value: staleBefore },
    ]).catch(() => undefined);
  }

  private async persistBatch(client: DataClient, records: TRecord[]) {
    const existingRows = await client.select('public_company_records', {
      select: 'record_key,content_hash',
      limit: records.length,
      filters: [
        { column: 'dataset_code', value: records[0].datasetCode },
        { column: 'record_key', operator: 'in', value: records.map((record) => record.recordKey) },
      ],
    }) as Array<{ record_key: string; content_hash: string | null }>;
    const existing = new Map(existingRows.map((row) => [row.record_key, row.content_hash]));
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const changed = records.filter((record) => {
      const previous = existing.get(record.recordKey);
      if (previous === undefined) {
        inserted += 1;
        return true;
      }
      if (previous !== record.contentHash) {
        updated += 1;
        return true;
      }
      unchanged += 1;
      return false;
    });
    if (!changed.length) return { inserted, updated, unchanged, written: 0 };

    const now = new Date().toISOString();
    await client.upsert('bronze_historical_records', changed.map((record) => ({
      dataset_code: record.datasetCode,
      record_key: record.recordKey,
      ref_date: record.referenceDate,
      entity_cnpj: record.entityCnpj,
      payload: record.rawPayload,
      source_url: record.sourceUrl,
      content_hash: record.contentHash,
      ingested_at: now,
    })), 'dataset_code,record_key');
    await client.upsert('public_company_records', changed.map((record) => ({
      dataset_code: record.datasetCode,
      source_code: record.sourceCode,
      record_key: record.recordKey,
      entity_cnpj: record.entityCnpj,
      entity_name: record.entityName,
      record_type: record.recordType,
      reference_date: record.referenceDate,
      amount: record.amount,
      status: record.status,
      source_url: record.sourceUrl,
      resource_key: record.resourceKey,
      content_hash: record.contentHash,
      raw_payload: record.rawPayload,
      normalized_payload: record.normalizedPayload,
      observed_at: now,
      updated_at: now,
    })), 'dataset_code,record_key');
    return { inserted, updated, unchanged, written: changed.length };
  }

  private async saveCheckpoint(
    client: DataClient,
    datasetCode: TCode,
    sourceId: string,
    resource: PublicBulkResource,
    state: {
      status: 'completed' | 'partial' | 'failed';
      contentHash: string | null;
      rowsScanned: number;
      recordsMatched: number;
      lastSuccessfulRunAt: string | null;
      error?: string;
    },
  ) {
    const checkedAt = new Date().toISOString();
    await client.upsert('public_dataset_resource_checkpoints', [{
      dataset_code: datasetCode,
      source_id: sourceId,
      resource_key: resource.key,
      resource_name: resource.name,
      resource_url: resource.url,
      resource_modified_at: resource.modifiedAt ?? null,
      etag: resource.etag ?? null,
      content_hash: state.contentHash,
      status: state.status,
      last_successful_run_at: state.lastSuccessfulRunAt,
      last_checked_at: checkedAt,
      rows_scanned: state.rowsScanned,
      records_matched: state.recordsMatched,
      error_message: state.error ?? null,
      metadata: {
        format: resource.format,
        encoding: resource.encoding,
        delimiter: resource.delimiter,
        referenceDate: resource.referenceDate,
        ...this.adapter.checkpointMetadata,
      },
      updated_at: checkedAt,
    }], 'dataset_code,resource_key');
  }
}
