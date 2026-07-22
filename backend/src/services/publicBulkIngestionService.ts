import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import {
  discoverPublicBulkResources,
  streamPublicBulkResource,
  type PublicBulkDatasetCode,
  type PublicBulkRecord,
  type PublicBulkResource,
} from '../modules/public-data/publicBulkDatasetConnector.js';

const STALE_RUN_MS = 6 * 60 * 60 * 1_000;
const BATCH_SIZE = 100;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const sourceCodeFor = (dataset: PublicBulkDatasetCode) => ({
  rfb_cnpj: 'src_rfb_cnpj_bulk',
  pgfn_debt: 'src_pgfn_divida_ativa_bulk',
  bndes_financing_operations: 'src_bndes_financing_operations',
  cgu_ceis: 'src_cgu_transparencia_bulk',
  cgu_cnep: 'src_cgu_transparencia_bulk',
  compras_contracts: 'src_compras_gov_contracts',
})[dataset];

export type PublicBulkIngestionOptions = {
  datasets: PublicBulkDatasetCode[];
  reference?: string;
  maxMatchedRows?: number;
  maxResources?: number;
  triggerType?: 'manual' | 'schedule' | 'backfill';
  discoverOnly?: boolean;
  fullCoverage?: boolean;
};

type Summary = {
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

type SourceRow = { id: string; status: string; health: string; metadata?: Record<string, unknown> };
type CheckpointRow = {
  resource_key: string;
  resource_modified_at: string | null;
  etag: string | null;
  content_hash: string | null;
  status: string;
  last_successful_run_at: string | null;
};

const blank = (datasetCode: PublicBulkDatasetCode): Summary => ({
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
    const limits = {
      maxMatchedRows: Math.max(1, Math.min(options.maxMatchedRows ?? 100_000, 1_000_000)),
      maxResources: Math.max(1, Math.min(options.maxResources ?? 20, 100)),
    };
    const summaries: Summary[] = [];
    for (const datasetCode of datasets) {
      summaries.push(await this.runDataset(datasetCode, {
        ...limits,
        reference: options.reference,
        triggerType: options.triggerType ?? 'manual',
        discoverOnly: options.discoverOnly ?? false,
        fullCoverage: options.fullCoverage ?? false,
      }));
    }
    const sum = (key: keyof Summary) => summaries.reduce((total, item) => total + Number(item[key] ?? 0), 0);
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

  private async runDataset(datasetCode: PublicBulkDatasetCode, options: {
    reference?: string;
    maxMatchedRows: number;
    maxResources: number;
    triggerType: 'manual' | 'schedule' | 'backfill';
    discoverOnly: boolean;
    fullCoverage: boolean;
  }): Promise<Summary> {
    const summary = blank(datasetCode);
    let resources: PublicBulkResource[];
    try {
      resources = await discoverPublicBulkResources(datasetCode, options);
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

    const targetRows = await this.client!.select('companies', { select: 'id,cnpj', limit: 50_000 }) as Array<{ id: string; cnpj: string | null }>;
    const targetCnpjs = new Set(targetRows.map((row) => String(row.cnpj ?? '').replace(/\D/g, '')).filter((cnpj) => cnpj.length === 14));
    const targetRoots = new Set([...targetCnpjs].map((cnpj) => cnpj.slice(0, 8)));
    if (!targetCnpjs.size) {
      summary.errors.push('Company Master has no valid CNPJ targets.');
      return summary;
    }

    const sourceCode = sourceCodeFor(datasetCode);
    const sources = await this.client!.select('source_catalog', { select: 'id,status,health,metadata', limit: 1_000 }) as SourceRow[];
    const source = sources.find((row) => row.metadata?.code === sourceCode);
    if (!source) {
      summary.errors.push(`Source catalog entry not found: ${sourceCode}.`);
      return summary;
    }

    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    await this.closeStaleRuns(datasetCode, startedAt);
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

    const checkpointRows = await this.client!.select('public_dataset_resource_checkpoints', {
      select: 'resource_key,resource_modified_at,etag,content_hash,status,last_successful_run_at',
      limit: 1_000,
      filters: [{ column: 'dataset_code', value: datasetCode }],
    }) as CheckpointRow[];
    const checkpoints = new Map(checkpointRows.map((row) => [row.resource_key, row]));

    for (const resource of resources) {
      if (summary.recordsMatched >= options.maxMatchedRows) break;
      const previous = checkpoints.get(resource.key);
      const unchangedResource = options.triggerType === 'schedule'
        && previous?.status === 'completed'
        && Boolean(resource.etag || resource.modifiedAt)
        && (!resource.etag || previous.etag === resource.etag)
        && (!resource.modifiedAt || previous.resource_modified_at === resource.modifiedAt);
      if (unchangedResource) {
        summary.resourcesSkipped += 1;
        continue;
      }

      const aggregateHash = createHash('sha256');
      let pending: PublicBulkRecord[] = [];
      const flush = async () => {
        if (!pending.length) return;
        const result = await this.persistBatch(pending);
        summary.recordsInserted += result.inserted;
        summary.recordsUpdated += result.updated;
        summary.recordsUnchanged += result.unchanged;
        summary.bronzeRowsWritten += result.written;
        summary.normalizedRowsWritten += result.written;
        pending = [];
      };

      try {
        const stats = await streamPublicBulkResource({
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
        await this.saveCheckpoint(datasetCode, source.id, resource, {
          status: 'completed',
          contentHash: aggregateHash.digest('hex'),
          rowsScanned: stats.rowsScanned,
          recordsMatched: stats.recordsMatched,
          lastSuccessfulRunAt: startedAt,
        });
      } catch (error) {
        const message = `${resource.name}: ${errorMessage(error)}`;
        summary.errors.push(message);
        await this.saveCheckpoint(datasetCode, source.id, resource, {
          status: 'failed',
          contentHash: previous?.content_hash ?? null,
          rowsScanned: 0,
          recordsMatched: 0,
          lastSuccessfulRunAt: previous?.last_successful_run_at ?? null,
          error: message,
        }).catch(() => undefined);
      }
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

    const successful = summary.resourcesProcessed > 0 || summary.resourcesSkipped > 0;
    summary.status = !successful ? 'failed' : summary.errors.length ? 'partial' : 'completed';
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
      metadata: { reference: options.reference ?? null, targetCompanyCount: targetCnpjs.size, errors: summary.errors },
      updated_at: finishedAt,
    }, [{ column: 'id', value: runId }]);

    const fullCoverage = options.fullCoverage
      && summary.status === 'completed'
      && summary.resourcesProcessed + summary.resourcesSkipped === summary.resourcesDiscovered;
    await this.client!.update('source_catalog', {
      status: fullCoverage ? 'real' : source.status,
      health: summary.status === 'failed' ? 'degraded' : 'healthy',
      metadata: {
        ...(source.metadata ?? {}),
        implementedRuntime: true,
        implementationPhase: fullCoverage ? 'runtime_active' : 'bulk_loader_active_partial_coverage',
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

  private async closeStaleRuns(datasetCode: string, now: string) {
    const staleBefore = new Date(Date.now() - STALE_RUN_MS).toISOString();
    await this.client!.update('public_dataset_runs', {
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

  private async persistBatch(records: PublicBulkRecord[]) {
    const existingRows = await this.client!.select('public_company_records', {
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
      if (previous === undefined) { inserted += 1; return true; }
      if (previous !== record.contentHash) { updated += 1; return true; }
      unchanged += 1;
      return false;
    });
    if (!changed.length) return { inserted, updated, unchanged, written: 0 };
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
    return { inserted, updated, unchanged, written: changed.length };
  }

  private async saveCheckpoint(
    datasetCode: PublicBulkDatasetCode,
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
    await this.client!.upsert('public_dataset_resource_checkpoints', [{
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
      },
      updated_at: checkedAt,
    }], 'dataset_code,resource_key');
  }
}
