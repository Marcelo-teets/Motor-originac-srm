import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { createPlatformRepository } from '../repositories/platformRepository.js';
import {
  discoverFinepPublicResources,
  FINEP_DATASET_CODE,
  FINEP_SOURCE_CODE,
  streamFinepPublicResource,
  type FinepPublicRecord,
  type FinepPublicResource,
} from '../modules/public-data/finepPublicDataConnector.js';
import { PlatformService } from './platformService.js';
import {
  isEligibleStrategicMonitoringTarget,
  type StrategicTargetCompanyRow,
} from './strategicPublicIngestionService.js';

export type FinepPublicRunOptions = {
  triggerType?: 'manual' | 'schedule' | 'backfill';
  maxMatchedRows?: number;
  discoverOnly?: boolean;
  force?: boolean;
};

type SourceRow = {
  id: string;
  status: string;
  health: string;
  metadata?: Record<string, unknown> | null;
};
type ExistingRecord = { record_key: string; content_hash: string };
type CheckpointRow = {
  resource_key: string;
  etag: string | null;
  resource_modified_at: string | null;
  content_hash: string | null;
  status: string;
  last_successful_run_at: string | null;
};
type SyncResult = { outputs_written?: number; signals_written?: number };

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export class FinepPublicIngestionService {
  private readonly client = getSupabaseClient();

  async run(options: FinepPublicRunOptions = {}) {
    const startedAt = new Date().toISOString();
    const triggerType = options.triggerType ?? 'manual';
    const maxMatchedRows = Math.max(1, Math.min(options.maxMatchedRows ?? 100_000, 1_000_000));
    if (!this.client) {
      return {
        status: 'failed' as const,
        generatedAt: new Date().toISOString(),
        error: 'Supabase client is not configured for Finep ingestion.',
        resources: [],
        totals: { rowsScanned: 0, recordsMatched: 0, recordsWritten: 0, outputsWritten: 0, signalsWritten: 0 },
      };
    }

    const [companyRowsRaw, sourceRows] = await Promise.all([
      this.client.select('companies', { select: 'id,cnpj,metadata', limit: 50_000 }) as Promise<StrategicTargetCompanyRow[]>,
      this.client.select('source_catalog', { select: 'id,status,health,metadata', limit: 2_000 }) as Promise<SourceRow[]>,
    ]);
    const companyRows = companyRowsRaw.filter(isEligibleStrategicMonitoringTarget);
    const source = sourceRows.find((row) => row.metadata?.code === FINEP_SOURCE_CODE);
    if (!source) {
      return {
        status: 'failed' as const,
        generatedAt: new Date().toISOString(),
        error: 'Finep source catalog entry was not found.',
        resources: [],
        totals: { rowsScanned: 0, recordsMatched: 0, recordsWritten: 0, outputsWritten: 0, signalsWritten: 0 },
      };
    }

    const targetCnpjs = new Set(companyRows.map((company) => digits(company.cnpj)).filter((value) => value.length === 14));
    const targetRoots = new Set([...targetCnpjs].map((cnpj) => cnpj.slice(0, 8)));
    const companyByCnpj = new Map<string, StrategicTargetCompanyRow>();
    for (const company of companyRows) {
      const cnpj = digits(company.cnpj);
      if (cnpj.length !== 14) continue;
      companyByCnpj.set(cnpj, company);
      if (!companyByCnpj.has(cnpj.slice(0, 8))) companyByCnpj.set(cnpj.slice(0, 8), company);
    }

    const resources = await discoverFinepPublicResources();
    const runId = randomUUID();
    await this.client.insert('public_dataset_runs', [{
      id: runId,
      dataset_code: FINEP_DATASET_CODE,
      source_id: source.id,
      trigger_type: triggerType,
      status: 'running',
      started_at: startedAt,
      resources_discovered: resources.length,
      metadata: {
        connectorFamily: 'finep_official_xlsx_v1',
        discoverOnly: options.discoverOnly ?? false,
        force: options.force ?? false,
        targetCompanyCount: companyRows.length,
        sourceAuthority: 'official_primary',
      },
    }]);

    if (options.discoverOnly) {
      const finishedAt = new Date().toISOString();
      await this.client.update('public_dataset_runs', {
        status: 'completed',
        finished_at: finishedAt,
        resources_processed: 0,
        resources_skipped: resources.length,
        metadata: {
          connectorFamily: 'finep_official_xlsx_v1',
          discoverOnly: true,
          targetCompanyCount: companyRows.length,
          resources,
        },
        updated_at: finishedAt,
      }, [{ column: 'id', value: runId }]);
      return {
        status: 'real' as const,
        generatedAt: finishedAt,
        runId,
        discoverOnly: true,
        resources,
        totals: { rowsScanned: 0, recordsMatched: 0, recordsWritten: 0, outputsWritten: 0, signalsWritten: 0 },
      };
    }

    const checkpointRows = await this.client.select('public_dataset_resource_checkpoints', {
      select: 'resource_key,etag,resource_modified_at,content_hash,status,last_successful_run_at',
      filters: [{ column: 'dataset_code', value: FINEP_DATASET_CODE }],
      limit: 100,
    }) as CheckpointRow[];
    const checkpoints = new Map(checkpointRows.map((row) => [row.resource_key, row]));
    const matchedCompanyIds = new Set<string>();
    const decisionEligibleCompanyIds = new Set<string>();
    const resourceResults: Array<Record<string, unknown>> = [];
    const errors: string[] = [];
    let rowsScanned = 0;
    let recordsMatched = 0;
    let recordsWritten = 0;
    let resourcesProcessed = 0;
    let resourcesSkipped = 0;

    for (const resource of resources) {
      const checkpoint = checkpoints.get(resource.key);
      const unchanged = !options.force
        && checkpoint?.status === 'completed'
        && ((resource.etag && checkpoint.etag === resource.etag)
          || (resource.modifiedAt && checkpoint.resource_modified_at === resource.modifiedAt));
      if (unchanged) {
        resourcesSkipped += 1;
        resourceResults.push({ resourceKey: resource.key, status: 'skipped', reason: 'resource_unchanged' });
        continue;
      }

      const pending: FinepPublicRecord[] = [];
      let writtenForResource = 0;
      const flush = async () => {
        if (!pending.length) return;
        const result = await this.persistBatch(pending.splice(0, pending.length));
        writtenForResource += result.written;
      };

      try {
        const stats = await streamFinepPublicResource({
          resource,
          targetCnpjs,
          targetRoots,
          maxMatchedRows: Math.max(1, maxMatchedRows - recordsMatched),
          onRecord: async (record) => {
            pending.push(record);
            const company = companyByCnpj.get(record.entityCnpj) ?? companyByCnpj.get(record.entityCnpj.slice(0, 8));
            if (company) {
              matchedCompanyIds.add(company.id);
              if (company.metadata?.decision_eligible === true) decisionEligibleCompanyIds.add(company.id);
            }
            if (pending.length >= 200) await flush();
          },
        });
        await flush();
        rowsScanned += stats.rowsScanned;
        recordsMatched += stats.recordsMatched;
        recordsWritten += writtenForResource;
        resourcesProcessed += 1;
        await this.saveCheckpoint(source.id, resource, {
          status: 'completed',
          contentHash: resource.etag ?? resource.modifiedAt,
          rowsScanned: stats.rowsScanned,
          recordsMatched: stats.recordsMatched,
          lastSuccessfulRunAt: new Date().toISOString(),
        });
        resourceResults.push({
          resourceKey: resource.key,
          status: 'completed',
          rowsScanned: stats.rowsScanned,
          recordsMatched: stats.recordsMatched,
          recordsWritten: writtenForResource,
          sheetsScanned: stats.sheetsScanned,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${resource.key}: ${message}`);
        await this.saveCheckpoint(source.id, resource, {
          status: 'failed',
          contentHash: null,
          rowsScanned: 0,
          recordsMatched: 0,
          lastSuccessfulRunAt: checkpoint?.last_successful_run_at ?? null,
          error: message,
        });
        resourceResults.push({ resourceKey: resource.key, status: 'failed', error: message });
      }
    }

    let outputsWritten = 0;
    let signalsWritten = 0;
    if (resourcesProcessed > 0) {
      const outputs = await this.client.rpc<SyncResult>('sync_public_dataset_company_outputs', {
        p_dataset_code: FINEP_DATASET_CODE,
      });
      outputsWritten = asNumber(outputs?.outputs_written);
      const signals = await this.client.rpc<SyncResult>('sync_finep_company_signals', {
        p_dataset_code: FINEP_DATASET_CODE,
      });
      signalsWritten = asNumber(signals?.signals_written);
    }

    const downstream = await this.recomputeDecisionEligibleCompanies([...decisionEligibleCompanyIds]);
    const status = resourcesProcessed === 0 && errors.length
      ? 'failed'
      : errors.length ? 'partial' : 'completed';
    const finishedAt = new Date().toISOString();
    await this.client.update('public_dataset_runs', {
      status,
      finished_at: finishedAt,
      resources_processed: resourcesProcessed,
      resources_skipped: resourcesSkipped,
      rows_scanned: rowsScanned,
      records_matched: recordsMatched,
      bronze_rows_written: recordsWritten,
      normalized_rows_written: recordsWritten,
      outputs_written: outputsWritten,
      signals_written: signalsWritten,
      error_message: errors.length ? errors.slice(0, 10).join(' | ') : null,
      metadata: {
        connectorFamily: 'finep_official_xlsx_v1',
        sourceAuthority: 'official_primary',
        targetCompanyCount: companyRows.length,
        matchedCompanyCount: matchedCompanyIds.size,
        decisionEligibleCompanyCount: decisionEligibleCompanyIds.size,
        downstream,
        errors,
      },
      updated_at: finishedAt,
    }, [{ column: 'id', value: runId }]);

    await this.client.update('source_catalog', {
      status: status === 'failed' ? 'partial' : 'real',
      health: status === 'failed' ? 'degraded' : errors.length ? 'degraded' : 'healthy',
      metadata: {
        ...(source.metadata ?? {}),
        code: FINEP_SOURCE_CODE,
        datasetCode: FINEP_DATASET_CODE,
        provider: 'finep',
        official: true,
        free: true,
        sourceAuthority: 'official_primary',
        implementedRuntime: true,
        connectorFamily: 'finep_official_xlsx_v1',
        lastRunAt: finishedAt,
        lastRunStatus: status,
        lastRecordsMatched: recordsMatched,
        lastOutputsWritten: outputsWritten,
        lastSignalsWritten: signalsWritten,
      },
      updated_at: finishedAt,
    }, [{ column: 'id', value: source.id }]);

    return {
      status: status === 'completed' ? 'real' as const : status === 'partial' ? 'partial' as const : 'failed' as const,
      generatedAt: finishedAt,
      runId,
      resources: resourceResults,
      totals: {
        rowsScanned,
        recordsMatched,
        recordsWritten,
        outputsWritten,
        signalsWritten,
        resourcesProcessed,
        resourcesSkipped,
        matchedCompanies: matchedCompanyIds.size,
        decisionEligibleCompanies: decisionEligibleCompanyIds.size,
      },
      downstream,
      errors,
    };
  }

  private async persistBatch(inputRecords: FinepPublicRecord[]) {
    const records = [...new Map(inputRecords.map((record) => [record.recordKey, record])).values()];
    if (!records.length) return { written: 0 };
    const existing = await this.client!.select('public_company_records', {
      select: 'record_key,content_hash',
      filters: [{ column: 'record_key', operator: 'in', value: records.map((record) => record.recordKey) }],
      limit: records.length,
    }) as ExistingRecord[];
    const hashes = new Map(existing.map((row) => [row.record_key, row.content_hash]));
    const changed = records.filter((record) => hashes.get(record.recordKey) !== record.contentHash);
    if (!changed.length) return { written: 0 };
    const observedAt = new Date().toISOString();
    await this.client!.upsert('bronze_historical_records', changed.map((record) => ({
      dataset_code: record.datasetCode,
      record_key: record.recordKey,
      ref_date: record.referenceDate,
      entity_cnpj: record.entityCnpj,
      payload: record.rawPayload,
      source_url: record.sourceUrl,
      content_hash: record.contentHash,
      ingested_at: observedAt,
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
      observed_at: observedAt,
      updated_at: observedAt,
    })), 'dataset_code,record_key');
    return { written: changed.length };
  }

  private async recomputeDecisionEligibleCompanies(companyIds: string[]) {
    const result = {
      requested: companyIds.length,
      recomputed: 0,
      qualificationsWritten: 0,
      patternsWritten: 0,
      scoreSnapshotsWritten: 0,
      leadScoreSnapshotsWritten: 0,
      rankingRefreshed: false,
      errors: [] as string[],
    };
    if (!companyIds.length) return result;
    const platform = new PlatformService(createPlatformRepository('supabase'));
    for (const companyId of companyIds) {
      try {
        const recomputed = await platform.recomputeDerivedData(companyId);
        result.recomputed += 1;
        result.qualificationsWritten += recomputed.qualifications.length;
        result.patternsWritten += recomputed.patterns.length;
        result.scoreSnapshotsWritten += recomputed.scoreSnapshots.length;
        result.leadScoreSnapshotsWritten += recomputed.leadScoreSnapshots.length;
      } catch (error) {
        result.errors.push(`${companyId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      await this.client!.rpc('refresh_ranking_v2', {});
      result.rankingRefreshed = true;
    } catch (error) {
      result.errors.push(`refresh_ranking_v2: ${error instanceof Error ? error.message : String(error)}`);
    }
    return result;
  }

  private async saveCheckpoint(sourceId: string, resource: FinepPublicResource, state: {
    status: 'completed' | 'failed';
    contentHash: string | null;
    rowsScanned: number;
    recordsMatched: number;
    lastSuccessfulRunAt: string | null;
    error?: string;
  }) {
    const checkedAt = new Date().toISOString();
    await this.client!.upsert('public_dataset_resource_checkpoints', [{
      dataset_code: FINEP_DATASET_CODE,
      source_id: sourceId,
      resource_key: resource.key,
      resource_name: resource.name,
      resource_url: resource.url,
      resource_modified_at: resource.modifiedAt,
      etag: resource.etag,
      content_hash: state.contentHash,
      status: state.status,
      last_successful_run_at: state.lastSuccessfulRunAt,
      last_checked_at: checkedAt,
      rows_scanned: state.rowsScanned,
      records_matched: state.recordsMatched,
      error_message: state.error ?? null,
      metadata: {
        format: resource.format,
        kind: resource.kind,
        pageUrl: resource.pageUrl,
        referenceDate: resource.referenceDate,
        connectorFamily: 'finep_official_xlsx_v1',
      },
      updated_at: checkedAt,
    }], 'dataset_code,resource_key');
  }
}
