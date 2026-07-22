import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import {
  discoverPublicBulkResources,
  streamPublicBulkResource,
  type PublicBulkDatasetCode,
  type PublicBulkRecord,
  type PublicBulkResource,
} from '../modules/public-data/publicBulkDatasetConnector.js';

const STALE_RUN_AFTER_MS = 6 * 60 * 60 * 1_000;
const BATCH_SIZE = 100;

const chunks = <T>(items: T[], size = BATCH_SIZE) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const sourceCodeFor = (datasetCode: PublicBulkDatasetCode) => ({
  rfb_cnpj: 'src_rfb_cnpj_bulk',
  pgfn_debt: 'src_pgfn_divida_ativa_bulk',
  bndes_financing_operations: 'src_bndes_financing_operations',
  cgu_ceis: 'src_cgu_transparencia_bulk',
  cgu_cnep: 'src_cgu_transparencia_bulk',
  compras_contracts: 'src_compras_gov_contracts',
})[datasetCode];

export type PublicBulkIngestionOptions = {
  datasets: PublicBulkDatasetCode[];
  reference?: string;
  maxMatchedRows?: number;
  maxResources?: number;
  triggerType?: 'manual' | 'schedule' | 'backfill';
  discoverOnly?: boolean;
  fullCoverage?: boolean;
};

export type PublicBulkDatasetSummary = {
  datasetCode: PublicBulkDatasetCode;
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

type SourceRow = { id: string; name: string; status: string; health: string; metadata?: Record<string, unknown> };
type CheckpointRow = {
  resource_key: string;
  resource_url: string;
  resource_modified_at: string | null;
  etag: string | null;
  status: 'completed' | 'partial' | 'failed';
  content_hash: string | null;
  last_successful_run_at: string | null;
};

const emptySummary = (datasetCode: PublicBulkDatasetCode): PublicBulkDatasetSummary => ({
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

export class PublicBulkIngestionService {
  private readonly client = getSupabaseClient();

  async run(options: PublicBulkIngestionOptions) {
    if (!this.client) throw new Error('Supabase client not configured for public bulk ingestion.');
    const datasets = [...new Set(options.datasets)];
    const maxMatchedRows = Math.max(1, Math.min(options.maxMatchedRows ?? 100_000, 1_000_000));
    const maxResources = Math.max(1, Math.min(options.maxResources ?? 20, 100));
    const summaries: PublicBulkDatasetSummary[] = [];

    for (const datasetCode of datasets) {
      summaries.push(await this.runDataset(datasetCode, {
        reference: options.reference,
        maxMatchedRows,
        maxResources,
        triggerType: options.triggerType ?? 'manual',
        discoverOnly: options.discoverOnly ?? false,
        fullCoverage: options.fullCoverage ?? false,
      }));
    }

    return {
      status: summaries.every((summary) => summary.status === 'completed' || summary.status === 'discovered')
        ? 'real'
        : summaries.some((summary) => summary.status !== 'failed') ? 'partial' : 'failed',
      generatedAt: new Date().toISOString(),
      requested: { datasets, reference: options.reference ?? null, maxMatchedRows, maxResources },
      totals: {
        resourcesDiscovered: summaries.reduce((sum, item) => sum + item.resourcesDiscovered, 0),
        resourcesProcessed: summaries.reduce((sum, item) => sum + item.resourcesProcessed, 0),
        resourcesSkipped: summaries.reduce((sum, item) => sum + item.resourcesSkipped, 0),
        rowsScanned: summaries.reduce((sum, item) => sum + item.rowsScanned, 0),
        recordsMatched: summaries.reduce((sum, item) => sum + item.recordsMatched, 0),
        recordsInserted: summaries.reduce((sum, item) => sum + item.recordsInserted, 0),
        recordsUpdated: summaries.reduce((sum, item) => sum + item.recordsUpdated, 0),
        recordsUnchanged: summaries.reduce((sum, item) => sum + item.recordsUnchanged, 0),
        outputsWritten: summaries.reduce((sum, item) => sum + item.outputsWritten, 0),
        signalsWritten: summaries.reduce((sum, item) => sum + item.signalsWritten, 0),
      },
      datasets: summaries,
    };
  }

  private async runDataset(
    datasetCode: PublicBulkDatasetCode,
    options: Required<Pick<PublicBulkIngestionOptions, 'maxMatchedRows' | 'maxResources' | 'triggerType' | 'discoverOnly' | 'fullCoverage'>> & { reference?: string },
  ): Promise<PublicBulkDatasetSummary> {
    const summary = emptySummary(datasetCode);
    let resources: PublicBulkResource[] = [];
    try {
      resources = await discoverPublicBulkResources(datasetCode, {
        reference: options.reference,
        maxResources: options.maxResources,
      });
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

    const companies = await this.client!.select('companies', {
      select: 'id,cnpj',
      limit: 50_000,
      filters: [{ column: 'cnpj', operator: 'is', value: null }],
    }).catch(async () => this.client!.select('companies', { select: 'id,cnpj', limit: 50_000 })) as Array<{ id: string; cnpj: string | null }>;
    const normalizedCompanies = companies
      .map((company) => ({ ...company, normalizedCnpj: String(company.cnpj ?? '').replace(/\D/g, '') }))
      .filter((company) => company.normalizedCnpj.length === 14);
    const targetCnpjs = new Set(normalizedCompanies.map((company) => company.normalizedCnpj));
    const targetRoots = new Set(normalizedCompanies.map((company) => company.normalizedCnpj.slice(0, 8)));
    if (!targetCnpjs.size) {
      summary.errors.push('Company Master has no valid CNPJ targets.');
      return summary;
    }

    const sourceCode = sourceCodeFor(datasetCode);
    const sources = await this.client!.select('source_catalog', { select: 'id,name,status,health,metadata', limit: 1_000 }) as SourceRow[];
    const source = sources.find((row) => row.metadata?.code === sourceCode);
    if (!source) {
      summary.errors.push(`Source catalog entry not found: ${sourceCode}.`);
      return summary;
    }

    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const staleBefore = new Date(Date.now() - STALE_RUN_AFTER_MS).toISOString();
    await this.client!.update('public_dataset_runs', {
      status: 'failed',
      finished_at: startedAt,
      error_message: 'Automatically closed as stale.',
      updated_at: startedAt,
    }, [
      { column: 'dataset_code', value: datasetCode },
      { column: 'status', value: 'running' },
      { column: 'started_at', operator: 'lt', value: staleBefore },
    ]).catch(() => undefined);

    try {
      await this.client!.insert('public_dataset_runs', [{
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
        },
      }]);
    } catch (error) {
      summary.status = 'partial';
      summary.errors.push(`run_lock: ${errorMessage(error)}`);
      return summary;
    }

    const checkpoints = await this.client!.select('public_dataset_resource_checkpoints', {
      select: 'resource_key,resource_url,resource_modified_at,etag,status,content_hash,last_successful_run_at',
      limit: 1_000,
      filters: [{ column: 'dataset_code', value: datasetCode }],
    }) as CheckpointRow[];
    const checkpointMap = new Map(checkpoints.map((row) => [row.resource_key, row]));

    for (const resource of resources) {
      const checkpoint = checkpointMap.get(resource.key);
      const sameVersion = options.triggerType === 'schedule'
        && checkpoint?.status === 'completed'
        && Boolean(resource.etag || resource.modifiedAt)
        && (!resource.etag || checkpoint.etag === resource.etag)
        && (!resource.modifiedAt || checkpoint.resource_modified_at === resource.modifiedAt);
      if (sameVersion) {
        summary.resourcesSkipped += 1;
        continue;
      }

      const recordHashes = createHash('sha256');
      let batch: PublicBulkRecord[] = [];
      const flush = async () => {
        if (!batch.length) return;
        const persisted = await this.persistRecords(batch);
        summary.recordsInserted += persisted.inserted;
        summary.recordsUpdated += persisted.updated;
        summary.recordsUnchanged += persisted.unchanged;
        summary.bronzeRowsWritten += persisted.bronzeWritten;
        summary.normalizedRowsWritten += persisted.normalizedWritten;
        batch = [];
      };

      try {
        const stats = await streamPublicBulkResource({
          datasetCode,
          resource,
          targetCnpjs,
          targetRoots,
          maxMatchedRows: Math.max(1, options.maxMatchedRows - summary.recordsMatched),
          onRecord: async (record) => {
            recordHashes.update(record.contentHash);
            batch.push(record);
            if (batch.length >= BATCH_SIZE) await flush();
          },
        });
        await flush();
        summary.resourcesProcessed += 1;
        summary.rowsScanned += stats.rowsScanned;
        summary.recordsMatched += stats.recordsMatched;
        await this.saveCheckpoint({
          datasetCode,
          sourceId: source.id,
          resource,
          status: 'completed',
          contentHash: recordHashes.digest('hex'),
          rowsScanned: stats.rowsScanned,
          recordsMatched: stats.recordsMatched,
          lastSuccessfulRunAt: startedAt,
        });
      } catch (error) {
        const message = `${resource.name}: ${errorMessage(error)}`;
        summary.errors.push(message);
        await this.saveCheckpoint({
          datasetCode,
          sourceId: source.id,
          resource,
          status: 'failed',
          contentHash: checkpoint?.content_hash ?? null,
          rowsScanned: 0,
          recordsMatched: 0,
          lastSuccessfulRunAt: checkpoint?.last_successful_run_at ?? null,
          error: message,
        }).catch(() => undefined);
      }
      if (summary.recordsMatched >= options.maxMatchedRows) break;
    }

    if (summary.normalizedRowsWritten > 0 || summary.recordsUnchanged > 0) {
      try {
        const synced = await this.client!.rpc<{ outputs_written?: number; signals_written?: number }>(
          'sync_public_dataset_company_outputs',
          { p_dataset_code: datasetCode },
        );
        summary.outputsWritten = Number(synced?.outputs_written ?? 0);
        summary.signalsWritten = Number(synced?.signals_written ?? 0);
      } catch (error) {
        summary.errors.push(`signal_sync: ${errorMessage(error)}`);
      }
    }

    const hadSuccessfulScan = summary.resourcesProcessed > 0 || summary.resourcesSkipped > 0;
    summary.status = !hadSuccessfulScan ? 'failed' : summary.errors.length ? 'partial' : 'completed';
    const finishedAt = new Date().toISOString();
    await this.client!.update('public_dataset_runs', {
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
        fullCoverageRequested: options.fullCoverage,
        errors: summary.errors,
      },
      updated_at: finishedAt,
    }, [{ column: 'id', value: runId }]);

    const fullCoverageAchieved = options.fullCoverage && summary.status === 'completed' && summary.resourcesProcessed + summary.resourcesSkipped === summary.resourcesDiscovered;
    await this.client!.update('source_catalog', {
      status: fullCoverageAchieved ? 'real' : source.status,
      health: summary.status === 'failed' ? 'degraded' : 'healthy',
      metadata: {
        ...(source.metadata ?? {}),
        implementedRuntime: true,
        implementationPhase: fullCoverageAchieved ? 'runtime_active' : 'bulk_loader_active_partial_coverage',
        lastLoaderRunAt: finishedAt,
        lastLoaderStatus: summary.status,
        lastRowsScanned: summary.rowsScanned,
        lastRecordsMatched: summary.recordsMatched,
        fullCoverageAchieved,
      },
      updated_at: finishedAt,
    }, [{ column: 'id', value: source.id }]);

    return summary;
  }

  private async persistRecords(records: PublicBulkRecord[]) {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let bronzeWritten = 0;
    let normalizedWritten = 0;

    for (const batch of chunks(records)) {
      const existingRows = await this.client!.select('public_company_records', {
        select: 'record_key,content_hash',
        limit: batch.length,
        filters: [
          { column: 'dataset_code', value: batch[0].datasetCode },
          { column: 'record_key', operator: 'in', value: batch.map((record) => record.recordKey) },
        ],
      }) as Array<{ record_key: string; content_hash: string | null }>;
      const existing = new Map(existingRows.map((row) => [row.record_key, row.content_hash]));
      const changed: PublicBulkRecord[] = [];
      for (const record of batch) {
        const previousHash = existing.get(record.recordKey);
        if (previousHash === undefined) { inserted += 1; changed.push(record); }
        else if (previousHash !== record.contentHash) { updated += 1; changed.push(record); }
        else unchanged += 1;
      }
      if (!changed.length) continue;
      const now = new Date().toISOString();
      await this.client!.upsert('bronze_historical_records', changed.map((record) => ({
        dataset_code: record.datasetCode,
        record_key: record.recordKey,
        ref_date: record.referenceDate,
        entity_cnpj: record.entityCnpj,
        payload: record.rawPayload,
        source_url: record.sourceUrl,
        content_hash: record.contentHash,
        ingested_at: now,
      })), 'dataset_code,record_key');
      bronzeWritten += changed.length;
      await this.client!.upsert('public_company_records', changed.map((record) => ({
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
      normalizedWritten += changed.length;
    }
    return { inserted, updated, unchanged, bronzeWritten, normalizedWritten };
  }

  private async saveCheckpoint(input: {
    datasetCode: PublicBulkDatasetCode;
    sourceId: string;
    resource: PublicBulkResource;
    status: 'completed' | 'partial' | 'failed';
    contentHash: string | null;
    rowsScanned: number;
    recordsMatched: number;
    lastSuccessfulRunAt: string | null;
    error?: string;
  }) {
    const checkedAt = new Date().toISOString();
    await this.client!.upsert('public_dataset_resource_checkpoints', [{
      dataset_code: input.datasetCode,
      source_id: input.sourceId,
      resource_key: input.resource.key,
      resource_name: input.resource.name,
      resource_url: input.resource.url,
      resource_modified_at: input.resource.modifiedAt ?? null,
      etag: input.resource.etag ?? null,
      content_hash: input.contentHash,
      status: input.status,
      last_successful_run_at: input.lastSuccessfulRunAt,
      last_checked_at: checkedAt,
      rows_scanned: input.rowsScanned,
      records_matched: input.recordsMatched,
      error_message: input.error ?? null,
      metadata: {
        format: input.resource.format,
        encoding: input.resource.encoding,
        delimiter: input.resource.delimiter,
        referenceDate: input.resource.referenceDate,
      },
      updated_at: checkedAt,
    }], 'dataset_code,resource_key');
  }
}
