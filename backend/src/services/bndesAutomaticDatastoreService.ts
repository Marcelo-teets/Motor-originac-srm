import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import {
  buildCnpjFilterValues,
  discoverBndesAutomaticResource,
  fetchBndesAutomaticPage,
  fingerprintBndesTargetUniverse,
  type BndesAutomaticResource,
} from '../modules/public-data/bndesAutomaticDatastoreConnector.js';
import {
  normalizePublicBulkRow,
  type PublicBulkRecord,
} from '../modules/public-data/publicBulkDatasetConnector.js';

const DATASET_CODE = 'bndes_financing_operations';
const SOURCE_CODE = 'src_bndes_financing_operations';
const STALE_RUN_MS = 3 * 60 * 60 * 1_000;
const PERSIST_BATCH_SIZE = 100;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const numeric = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const cleanCnpj = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const toStringRecord = (row: Record<string, unknown>) => Object.fromEntries(
  Object.entries(row)
    .filter(([key]) => key !== '_id')
    .map(([key, value]) => [key, value === null || value === undefined ? '' : String(value)]),
);

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type SourceRow = { id: string; status: string; health: string; metadata?: Record<string, unknown> };
type CheckpointRow = {
  resource_key: string;
  status: 'completed' | 'partial' | 'failed';
  rows_scanned: number | string;
  records_matched: number | string;
  last_successful_run_at: string | null;
  metadata?: Record<string, unknown>;
};

export type BndesAutomaticDatastoreOptions = {
  targetBatchSize?: number;
  maxTargetBatches?: number;
  pageSize?: number;
  maxPagesPerTargetBatch?: number;
  triggerType?: 'manual' | 'schedule' | 'backfill';
  force?: boolean;
};

export type BndesAutomaticDatastoreResult = {
  status: 'completed' | 'partial' | 'failed' | 'up_to_date';
  resourceId: string;
  resourceHash: string;
  metadataSource: BndesAutomaticResource['metadataSource'];
  targetFingerprint: string;
  targetCount: number;
  targetsProcessed: number;
  nextTargetOffset: number;
  targetBatchesProcessed: number;
  apiRowsReturned: number;
  recordsMatched: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  recordsWritten: number;
  outputsWritten: number;
  signalsWritten: number;
  coverageScope: 'company_master_targets';
  sourceWideCoverage: false;
  error: string | null;
};

type Dependencies = {
  client?: SupabaseClient | null;
  discoverResource?: typeof discoverBndesAutomaticResource;
  fetchPage?: typeof fetchBndesAutomaticPage;
  now?: () => Date;
};

export class BndesAutomaticDatastoreService {
  private readonly client: SupabaseClient | null;
  private readonly discoverResource: typeof discoverBndesAutomaticResource;
  private readonly fetchPage: typeof fetchBndesAutomaticPage;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies = {}) {
    this.client = dependencies.client === undefined ? getSupabaseClient() : dependencies.client;
    this.discoverResource = dependencies.discoverResource ?? discoverBndesAutomaticResource;
    this.fetchPage = dependencies.fetchPage ?? fetchBndesAutomaticPage;
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(options: BndesAutomaticDatastoreOptions = {}): Promise<BndesAutomaticDatastoreResult> {
    if (!this.client) throw new Error('Supabase client not configured for BNDES automatic ingestion.');
    const targetBatchSize = Math.max(1, Math.min(options.targetBatchSize ?? 25, 250));
    const maxTargetBatches = Math.max(1, Math.min(options.maxTargetBatches ?? 100, 10_000));
    const pageSize = Math.max(1, Math.min(options.pageSize ?? 1_000, 5_000));
    const maxPagesPerTargetBatch = Math.max(1, Math.min(options.maxPagesPerTargetBatch ?? 100, 1_000));
    const triggerType = options.triggerType ?? 'manual';
    const resource = await this.discoverResource();
    if (!resource.datastoreActive) throw new Error('BNDES automatic resource does not expose an active CKAN Datastore.');

    const targetRows = await this.client.select('companies', { select: 'id,cnpj', limit: 50_000 }) as Array<{ id: string; cnpj: string | null }>;
    const targetCnpjs = [...new Set(targetRows
      .map((row) => cleanCnpj(row.cnpj))
      .filter((cnpj) => cnpj.length === 14))]
      .sort();
    if (!targetCnpjs.length) throw new Error('Company Master has no valid CNPJ targets.');

    const targetFingerprint = fingerprintBndesTargetUniverse(resource.resourceHash, targetCnpjs);
    const checkpointKey = `${resource.key}:targets:${targetFingerprint.slice(0, 24)}`;
    const checkpoints = await this.client.select('public_dataset_resource_checkpoints', {
      select: 'resource_key,status,rows_scanned,records_matched,last_successful_run_at,metadata',
      limit: 1,
      filters: [
        { column: 'dataset_code', value: DATASET_CODE },
        { column: 'resource_key', value: checkpointKey },
      ],
    }) as CheckpointRow[];
    const previous = checkpoints[0];
    const previousMetadata = previous?.metadata ?? {};
    const previousOffset = options.force ? 0 : Math.max(0, Math.min(
      numeric(previousMetadata.nextTargetOffset),
      targetCnpjs.length,
    ));
    const previousRowsReturned = options.force ? 0 : numeric(previous?.rows_scanned);
    const previousRecordsMatched = options.force ? 0 : numeric(previous?.records_matched);
    const previousRecordsWritten = options.force ? 0 : numeric(previousMetadata.recordsWritten);

    const sourceRows = await this.client.select('source_catalog', { select: 'id,status,health,metadata', limit: 1_000 }) as SourceRow[];
    const source = sourceRows.find((row) => row.metadata?.code === SOURCE_CODE);
    if (!source) throw new Error(`Source catalog entry not found: ${SOURCE_CODE}.`);

    const runId = crypto.randomUUID();
    const startedAt = this.now().toISOString();
    await this.closeStaleRuns(startedAt);
    try {
      await this.client.insert('public_dataset_runs', [{
        id: runId,
        dataset_code: DATASET_CODE,
        source_id: source.id,
        trigger_type: triggerType,
        status: 'running',
        started_at: startedAt,
        metadata: {
          mode: 'ckan_datastore_targeted',
          resourceId: resource.resourceId,
          resourceHash: resource.resourceHash,
          resourceSizeBytes: resource.sizeBytes,
          metadataSource: resource.metadataSource,
          targetFingerprint,
          targetCount: targetCnpjs.length,
          targetBatchSize,
          pageSize,
          maxTargetBatches,
          coverageScope: 'company_master_targets',
          sourceWideCoverage: false,
        },
      }]);
    } catch (error) {
      return this.emptyResult(resource, targetFingerprint, targetCnpjs.length, previousOffset, 'failed', `run_lock: ${errorMessage(error)}`);
    }

    if (!options.force && previous?.status === 'completed' && previousOffset >= targetCnpjs.length) {
      const finishedAt = this.now().toISOString();
      await this.finishRun(runId, {
        status: 'completed',
        finishedAt,
        resourcesProcessed: 0,
        resourcesSkipped: 1,
        rowsReturned: 0,
        recordsMatched: 0,
        recordsWritten: 0,
        outputsWritten: 0,
        signalsWritten: 0,
        metadata: {
          mode: 'ckan_datastore_targeted',
          upToDate: true,
          targetFingerprint,
          targetCount: targetCnpjs.length,
          nextTargetOffset: previousOffset,
          coverageScope: 'company_master_targets',
          sourceWideCoverage: false,
        },
      });
      await this.updateSource(source, resource, {
        status: 'completed',
        targetFingerprint,
        targetCount: targetCnpjs.length,
        nextTargetOffset: previousOffset,
        finishedAt,
        error: null,
      });
      return this.emptyResult(resource, targetFingerprint, targetCnpjs.length, previousOffset, 'up_to_date', null);
    }

    let nextTargetOffset = previousOffset;
    let targetBatchesProcessed = 0;
    let runRowsReturned = 0;
    let runRecordsMatched = 0;
    let runInserted = 0;
    let runUpdated = 0;
    let runUnchanged = 0;
    let runWritten = 0;
    let outputsWritten = 0;
    let signalsWritten = 0;
    let failure: string | null = null;

    try {
      while (nextTargetOffset < targetCnpjs.length && targetBatchesProcessed < maxTargetBatches) {
        const batch = targetCnpjs.slice(nextTargetOffset, nextTargetOffset + targetBatchSize);
        const filters = buildCnpjFilterValues(batch);
        let pageOffset = 0;
        let pages = 0;
        while (pages < maxPagesPerTargetBatch) {
          const page = await this.fetchPage({
            resourceId: resource.resourceId,
            cnpjFilters: filters,
            offset: pageOffset,
            limit: pageSize,
          });
          pages += 1;
          runRowsReturned += page.records.length;
          const normalized = page.records
            .map((row) => normalizePublicBulkRow({
              datasetCode: DATASET_CODE,
              row: toStringRecord(row),
              resource,
              targetCnpjs: new Set(batch),
              targetRoots: new Set(batch.map((cnpj) => cnpj.slice(0, 8))),
            }))
            .filter((record): record is PublicBulkRecord => Boolean(record));
          runRecordsMatched += normalized.length;
          for (let index = 0; index < normalized.length; index += PERSIST_BATCH_SIZE) {
            const persisted = await this.persistRecords(normalized.slice(index, index + PERSIST_BATCH_SIZE));
            runInserted += persisted.inserted;
            runUpdated += persisted.updated;
            runUnchanged += persisted.unchanged;
            runWritten += persisted.written;
          }
          pageOffset += page.records.length;
          if (!page.records.length || pageOffset >= page.total) break;
        }
        if (pages >= maxPagesPerTargetBatch && pageOffset > 0) {
          throw new Error(`BNDES datastore pagination exceeded ${maxPagesPerTargetBatch} pages for target batch starting at ${nextTargetOffset}.`);
        }
        nextTargetOffset += batch.length;
        targetBatchesProcessed += 1;
        await this.saveCheckpoint(source.id, resource, checkpointKey, {
          status: nextTargetOffset >= targetCnpjs.length ? 'completed' : 'partial',
          targetFingerprint,
          targetCount: targetCnpjs.length,
          nextTargetOffset,
          targetBatchSize,
          pageSize,
          apiRowsReturned: previousRowsReturned + runRowsReturned,
          recordsMatched: previousRecordsMatched + runRecordsMatched,
          recordsWritten: previousRecordsWritten + runWritten,
          lastSuccessfulRunAt: nextTargetOffset >= targetCnpjs.length ? this.now().toISOString() : previous?.last_successful_run_at ?? null,
          error: null,
        });
      }
    } catch (error) {
      failure = errorMessage(error);
      await this.saveCheckpoint(source.id, resource, checkpointKey, {
        status: nextTargetOffset > 0 ? 'partial' : 'failed',
        targetFingerprint,
        targetCount: targetCnpjs.length,
        nextTargetOffset,
        targetBatchSize,
        pageSize,
        apiRowsReturned: previousRowsReturned + runRowsReturned,
        recordsMatched: previousRecordsMatched + runRecordsMatched,
        recordsWritten: previousRecordsWritten + runWritten,
        lastSuccessfulRunAt: previous?.last_successful_run_at ?? null,
        error: failure,
      }).catch(() => undefined);
    }

    if (runWritten > 0 || runUnchanged > 0) {
      try {
        const synced = await this.client.rpc<{ outputs_written?: number; signals_written?: number }>(
          'sync_public_dataset_company_outputs',
          { p_dataset_code: DATASET_CODE },
        );
        outputsWritten = numeric(synced?.outputs_written);
        signalsWritten = numeric(synced?.signals_written);
      } catch (error) {
        failure = failure ?? `signal_sync: ${errorMessage(error)}`;
      }
    }

    const completed = !failure && nextTargetOffset >= targetCnpjs.length;
    const status: BndesAutomaticDatastoreResult['status'] = failure
      ? (nextTargetOffset > 0 ? 'partial' : 'failed')
      : completed ? 'completed' : 'partial';
    const finishedAt = this.now().toISOString();
    await this.finishRun(runId, {
      status: status === 'failed' ? 'failed' : status === 'partial' ? 'partial' : 'completed',
      finishedAt,
      resourcesProcessed: targetBatchesProcessed > 0 ? 1 : 0,
      resourcesSkipped: 0,
      rowsReturned: runRowsReturned,
      recordsMatched: runRecordsMatched,
      recordsWritten: runWritten,
      outputsWritten,
      signalsWritten,
      error: failure,
      metadata: {
        mode: 'ckan_datastore_targeted',
        resourceId: resource.resourceId,
        resourceHash: resource.resourceHash,
        metadataSource: resource.metadataSource,
        targetFingerprint,
        targetCount: targetCnpjs.length,
        targetBatchSize,
        targetBatchesProcessed,
        nextTargetOffset,
        cumulativeApiRowsReturned: previousRowsReturned + runRowsReturned,
        cumulativeRecordsMatched: previousRecordsMatched + runRecordsMatched,
        cumulativeRecordsWritten: previousRecordsWritten + runWritten,
        coverageScope: 'company_master_targets',
        sourceWideCoverage: false,
      },
    });
    await this.updateSource(source, resource, {
      status,
      targetFingerprint,
      targetCount: targetCnpjs.length,
      nextTargetOffset,
      finishedAt,
      error: failure,
    });

    return {
      status,
      resourceId: resource.resourceId,
      resourceHash: resource.resourceHash,
      metadataSource: resource.metadataSource,
      targetFingerprint,
      targetCount: targetCnpjs.length,
      targetsProcessed: nextTargetOffset,
      nextTargetOffset,
      targetBatchesProcessed,
      apiRowsReturned: runRowsReturned,
      recordsMatched: runRecordsMatched,
      recordsInserted: runInserted,
      recordsUpdated: runUpdated,
      recordsUnchanged: runUnchanged,
      recordsWritten: runWritten,
      outputsWritten,
      signalsWritten,
      coverageScope: 'company_master_targets',
      sourceWideCoverage: false,
      error: failure,
    };
  }

  private emptyResult(
    resource: BndesAutomaticResource,
    targetFingerprint: string,
    targetCount: number,
    nextTargetOffset: number,
    status: BndesAutomaticDatastoreResult['status'],
    error: string | null,
  ): BndesAutomaticDatastoreResult {
    return {
      status,
      resourceId: resource.resourceId,
      resourceHash: resource.resourceHash,
      metadataSource: resource.metadataSource,
      targetFingerprint,
      targetCount,
      targetsProcessed: nextTargetOffset,
      nextTargetOffset,
      targetBatchesProcessed: 0,
      apiRowsReturned: 0,
      recordsMatched: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      recordsWritten: 0,
      outputsWritten: 0,
      signalsWritten: 0,
      coverageScope: 'company_master_targets',
      sourceWideCoverage: false,
      error,
    };
  }

  private async persistRecords(records: PublicBulkRecord[]) {
    if (!records.length || !this.client) return { inserted: 0, updated: 0, unchanged: 0, written: 0 };
    const existingRows = await this.client.select('public_company_records', {
      select: 'record_key,content_hash',
      limit: records.length,
      filters: [
        { column: 'dataset_code', value: DATASET_CODE },
        { column: 'record_key', operator: 'in', value: records.map((record) => record.recordKey) },
      ],
    }) as Array<{ record_key: string; content_hash: string | null }>;
    const existing = new Map(existingRows.map((row) => [row.record_key, row.content_hash]));
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const changed = records.filter((record) => {
      const previous = existing.get(record.recordKey);
      if (previous === undefined) { inserted += 1; return true; }
      if (previous !== record.contentHash) { updated += 1; return true; }
      unchanged += 1;
      return false;
    });
    if (!changed.length) return { inserted, updated, unchanged, written: 0 };
    const observedAt = this.now().toISOString();
    await this.client.upsert('bronze_historical_records', changed.map((record) => ({
      dataset_code: record.datasetCode,
      record_key: record.recordKey,
      ref_date: record.referenceDate,
      entity_cnpj: record.entityCnpj,
      payload: record.rawPayload,
      source_url: record.sourceUrl,
      content_hash: record.contentHash,
      ingested_at: observedAt,
    })), 'dataset_code,record_key');
    await this.client.upsert('public_company_records', changed.map((record) => ({
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
      observed_at: observedAt,
      updated_at: observedAt,
    })), 'dataset_code,record_key');
    return { inserted, updated, unchanged, written: changed.length };
  }

  private async saveCheckpoint(
    sourceId: string,
    resource: BndesAutomaticResource,
    checkpointKey: string,
    state: {
      status: 'completed' | 'partial' | 'failed';
      targetFingerprint: string;
      targetCount: number;
      nextTargetOffset: number;
      targetBatchSize: number;
      pageSize: number;
      apiRowsReturned: number;
      recordsMatched: number;
      recordsWritten: number;
      lastSuccessfulRunAt: string | null;
      error: string | null;
    },
  ) {
    if (!this.client) return;
    const checkedAt = this.now().toISOString();
    await this.client.upsert('public_dataset_resource_checkpoints', [{
      dataset_code: DATASET_CODE,
      source_id: sourceId,
      resource_key: checkpointKey,
      resource_name: resource.name,
      resource_url: resource.url,
      resource_modified_at: resource.modifiedAt ?? null,
      etag: resource.resourceHash,
      content_hash: createHash('sha256').update(JSON.stringify({
        resourceHash: resource.resourceHash,
        targetFingerprint: state.targetFingerprint,
        nextTargetOffset: state.nextTargetOffset,
      })).digest('hex'),
      status: state.status,
      last_successful_run_at: state.lastSuccessfulRunAt,
      last_checked_at: checkedAt,
      rows_scanned: state.apiRowsReturned,
      records_matched: state.recordsMatched,
      error_message: state.error,
      metadata: {
        mode: 'ckan_datastore_targeted',
        resourceId: resource.resourceId,
        resourceHash: resource.resourceHash,
        resourceSizeBytes: resource.sizeBytes,
        metadataSource: resource.metadataSource,
        datastoreActive: resource.datastoreActive,
        targetFingerprint: state.targetFingerprint,
        targetCount: state.targetCount,
        nextTargetOffset: state.nextTargetOffset,
        targetsProcessed: state.nextTargetOffset,
        targetBatchSize: state.targetBatchSize,
        pageSize: state.pageSize,
        apiRowsReturned: state.apiRowsReturned,
        recordsWritten: state.recordsWritten,
        coverageScope: 'company_master_targets',
        sourceWideCoverage: false,
      },
      updated_at: checkedAt,
    }], 'dataset_code,resource_key');
  }

  private async finishRun(runId: string, state: {
    status: 'completed' | 'partial' | 'failed';
    finishedAt: string;
    resourcesProcessed: number;
    resourcesSkipped: number;
    rowsReturned: number;
    recordsMatched: number;
    recordsWritten: number;
    outputsWritten: number;
    signalsWritten: number;
    error?: string | null;
    metadata: Record<string, unknown>;
  }) {
    if (!this.client) return;
    await this.client.update('public_dataset_runs', {
      status: state.status,
      finished_at: state.finishedAt,
      resources_discovered: 1,
      resources_processed: state.resourcesProcessed,
      resources_skipped: state.resourcesSkipped,
      rows_scanned: state.rowsReturned,
      records_matched: state.recordsMatched,
      bronze_rows_written: state.recordsWritten,
      normalized_rows_written: state.recordsWritten,
      outputs_written: state.outputsWritten,
      signals_written: state.signalsWritten,
      error_message: state.error ?? null,
      metadata: state.metadata,
      updated_at: state.finishedAt,
    }, [{ column: 'id', value: runId }]);
  }

  private async updateSource(
    source: SourceRow,
    resource: BndesAutomaticResource,
    state: {
      status: BndesAutomaticDatastoreResult['status'];
      targetFingerprint: string;
      targetCount: number;
      nextTargetOffset: number;
      finishedAt: string;
      error: string | null;
    },
  ) {
    if (!this.client) return;
    const targetCoverageAchieved = ['completed', 'up_to_date'].includes(state.status)
      && state.nextTargetOffset >= state.targetCount;
    const authoritative = resource.metadataSource === 'resource_show';
    await this.client.update('source_catalog', {
      status: targetCoverageAchieved && authoritative ? 'real' : 'partial',
      health: state.error ? 'degraded' : 'healthy',
      metadata: {
        ...(source.metadata ?? {}),
        implementedRuntime: true,
        implementationPhase: targetCoverageAchieved ? 'runtime_active_target_coverage' : 'datastore_target_coverage_partial',
        lastLoaderRunAt: state.finishedAt,
        lastLoaderStatus: state.status,
        lastLoaderError: state.error,
        bndesAutomaticResourceId: resource.resourceId,
        bndesAutomaticResourceHash: resource.resourceHash,
        bndesAutomaticResourceSizeBytes: resource.sizeBytes,
        bndesAutomaticMetadataSource: resource.metadataSource,
        coverageMode: 'ckan_datastore_targeted',
        coverageScope: 'company_master_targets',
        sourceWideCoverage: false,
        targetCoverageFingerprint: state.targetFingerprint,
        targetCoverageCount: state.targetCount,
        targetCoverageProcessed: state.nextTargetOffset,
        targetCoverageAchieved,
        fullCoverageAchieved: targetCoverageAchieved,
      },
      updated_at: state.finishedAt,
    }, [{ column: 'id', value: source.id }]);
  }

  private async closeStaleRuns(now: string) {
    if (!this.client) return;
    const staleBefore = new Date(this.now().getTime() - STALE_RUN_MS).toISOString();
    await this.client.update('public_dataset_runs', {
      status: 'failed',
      finished_at: now,
      error_message: 'Automatically closed as stale before BNDES datastore ingestion.',
      updated_at: now,
    }, [
      { column: 'dataset_code', value: DATASET_CODE },
      { column: 'status', value: 'running' },
      { column: 'started_at', operator: 'lt', value: staleBefore },
    ]).catch(() => undefined);
  }
}
