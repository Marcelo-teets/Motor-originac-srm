import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import {
  discoverCvmOpenCompanyRegistry,
  streamCvmOpenCompanyRegistry,
  type CvmOpenCompanyRegistryRecord,
  type CvmOpenCompanyRegistryResource,
} from '../modules/public-data/cvmOpenCompanyRegistryConnector.js';

const DATASET_CODE = 'cvm_open_company_registry_candidates';
const SOURCE_CODE = 'src_cvm_open_company_registry';
const STALE_RUN_MS = 2 * 60 * 60 * 1_000;
const BATCH_SIZE = 100;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const cleanCnpj = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type SourceRow = { id: string; status: string; health: string; metadata?: Record<string, unknown> };
type TargetRow = { id: string; cnpj: string | null };
type CheckpointRow = {
  status: string;
  rows_scanned: number | string;
  records_matched: number | string;
  last_successful_run_at: string | null;
  metadata?: Record<string, unknown>;
};

export type CandidateCvmRegistryOptions = {
  triggerType?: 'manual' | 'schedule' | 'backfill';
  force?: boolean;
};

export type CandidateCvmRegistryResult = {
  status: 'completed' | 'failed' | 'up_to_date';
  targetCount: number;
  targetsMatched: number;
  rowsScanned: number;
  registryRecordsMatched: number;
  enrichmentsWritten: number;
  resourceVersion: string;
  targetFingerprint: string;
  error: string | null;
};

type Dependencies = {
  client?: SupabaseClient | null;
  discoverResource?: typeof discoverCvmOpenCompanyRegistry;
  streamResource?: typeof streamCvmOpenCompanyRegistry;
  now?: () => Date;
};

export class CandidateCvmRegistryService {
  private readonly client: SupabaseClient | null;
  private readonly discoverResource: typeof discoverCvmOpenCompanyRegistry;
  private readonly streamResource: typeof streamCvmOpenCompanyRegistry;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies = {}) {
    this.client = dependencies.client === undefined ? getSupabaseClient() : dependencies.client;
    this.discoverResource = dependencies.discoverResource ?? discoverCvmOpenCompanyRegistry;
    this.streamResource = dependencies.streamResource ?? streamCvmOpenCompanyRegistry;
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(options: CandidateCvmRegistryOptions = {}): Promise<CandidateCvmRegistryResult> {
    if (!this.client) throw new Error('Supabase client not configured for CVM candidate enrichment.');
    const triggerType = options.triggerType ?? 'manual';
    const resource = await this.discoverResource();
    const targetRows = await this.client.select('candidate_decision_queue_v2', {
      select: 'id,cnpj',
      limit: 50_000,
      filters: [
        { column: 'canonical_rank', value: 1 },
        { column: 'queue_type', operator: 'in', value: ['commercial', 'identity'] },
      ],
    }) as TargetRow[];
    const targets = targetRows
      .map((row) => ({ id: row.id, cnpj: cleanCnpj(row.cnpj) }))
      .filter((row) => row.cnpj.length === 14)
      .sort((left, right) => left.cnpj.localeCompare(right.cnpj) || left.id.localeCompare(right.id));
    if (!targets.length) throw new Error('Candidate Decision Queue has no valid reviewable CNPJ targets.');

    const targetMap = new Map<string, string[]>();
    for (const target of targets) {
      const candidateIds = targetMap.get(target.cnpj) ?? [];
      candidateIds.push(target.id);
      targetMap.set(target.cnpj, candidateIds);
    }
    const targetCnpjs = new Set(targetMap.keys());
    const resourceVersion = resource.etag ?? resource.modifiedAt ?? 'unversioned';
    const targetFingerprint = hash({ resourceVersion, targets });
    const checkpointKey = `${resource.key}:targets:${targetFingerprint.slice(0, 24)}`;

    const sourceRows = await this.client.select('source_catalog', {
      select: 'id,status,health,metadata', limit: 1_000,
    }) as SourceRow[];
    const source = sourceRows.find((row) => row.metadata?.code === SOURCE_CODE);
    if (!source) throw new Error(`Source catalog entry not found: ${SOURCE_CODE}.`);

    const checkpointRows = await this.client.select('public_dataset_resource_checkpoints', {
      select: 'status,rows_scanned,records_matched,last_successful_run_at,metadata',
      limit: 1,
      filters: [
        { column: 'dataset_code', value: DATASET_CODE },
        { column: 'resource_key', value: checkpointKey },
      ],
    }) as CheckpointRow[];
    const checkpoint = checkpointRows[0];

    const runId = crypto.randomUUID();
    const startedAt = this.now().toISOString();
    await this.closeStaleRuns(startedAt);
    await this.client.insert('public_dataset_runs', [{
      id: runId,
      dataset_code: DATASET_CODE,
      source_id: source.id,
      trigger_type: triggerType,
      status: 'running',
      started_at: startedAt,
      metadata: {
        mode: 'official_csv_targeted',
        resourceVersion,
        targetFingerprint,
        targetCount: targets.length,
        uniqueTargetCnpjs: targetCnpjs.size,
        coverageScope: 'canonical_reviewable_candidates',
      },
    }]);

    if (!options.force && checkpoint?.status === 'completed') {
      const finishedAt = this.now().toISOString();
      await this.finishRun(runId, {
        status: 'completed', finishedAt, rowsScanned: 0, recordsMatched: 0,
        enrichmentsWritten: 0, resourcesProcessed: 0, resourcesSkipped: 1,
        metadata: {
          mode: 'official_csv_targeted', upToDate: true, resourceVersion,
          targetFingerprint, targetCount: targets.length,
          coverageScope: 'canonical_reviewable_candidates',
        },
      });
      await this.updateSource(source, resource, {
        status: 'up_to_date', finishedAt, targetFingerprint,
        targetCount: targets.length, targetsMatched: Number(checkpoint.metadata?.targetsMatched ?? 0),
        rowsScanned: Number(checkpoint.rows_scanned ?? 0), error: null,
      });
      return {
        status: 'up_to_date', targetCount: targets.length,
        targetsMatched: Number(checkpoint.metadata?.targetsMatched ?? 0),
        rowsScanned: 0, registryRecordsMatched: 0, enrichmentsWritten: 0,
        resourceVersion, targetFingerprint, error: null,
      };
    }

    let pending: Array<Record<string, unknown>> = [];
    let enrichmentsWritten = 0;
    const matchedCandidateIds = new Set<string>();
    const observedAt = this.now().toISOString();
    const flush = async () => {
      if (!pending.length || !this.client) return;
      await this.client.upsert(
        'candidate_official_enrichments',
        pending,
        'candidate_id,dataset_code,source_record_key',
      );
      enrichmentsWritten += pending.length;
      pending = [];
    };

    try {
      const stats = await this.streamResource({
        resource,
        targetCnpjs,
        onRecord: async (record) => {
          for (const candidateId of targetMap.get(record.cnpj) ?? []) {
            matchedCandidateIds.add(candidateId);
            pending.push(this.enrichmentRow(candidateId, source.id, record, observedAt));
            if (pending.length >= BATCH_SIZE) await flush();
          }
        },
      });
      await flush();
      const finishedAt = this.now().toISOString();
      await this.saveCheckpoint(source.id, resource, checkpointKey, {
        status: 'completed', resourceVersion, targetFingerprint,
        targetCount: targets.length, targetsMatched: matchedCandidateIds.size,
        rowsScanned: stats.rowsScanned, recordsMatched: stats.recordsMatched,
        enrichmentsWritten, lastSuccessfulRunAt: finishedAt, error: null,
      });
      await this.finishRun(runId, {
        status: 'completed', finishedAt, rowsScanned: stats.rowsScanned,
        recordsMatched: stats.recordsMatched, enrichmentsWritten,
        resourcesProcessed: 1, resourcesSkipped: 0,
        metadata: {
          mode: 'official_csv_targeted', resourceVersion, targetFingerprint,
          targetCount: targets.length, targetsMatched: matchedCandidateIds.size,
          coverageScope: 'canonical_reviewable_candidates',
        },
      });
      await this.updateSource(source, resource, {
        status: 'completed', finishedAt, targetFingerprint,
        targetCount: targets.length, targetsMatched: matchedCandidateIds.size,
        rowsScanned: stats.rowsScanned, error: null,
      });
      return {
        status: 'completed', targetCount: targets.length,
        targetsMatched: matchedCandidateIds.size, rowsScanned: stats.rowsScanned,
        registryRecordsMatched: stats.recordsMatched, enrichmentsWritten,
        resourceVersion, targetFingerprint, error: null,
      };
    } catch (error) {
      const message = errorMessage(error);
      const finishedAt = this.now().toISOString();
      await this.saveCheckpoint(source.id, resource, checkpointKey, {
        status: 'failed', resourceVersion, targetFingerprint,
        targetCount: targets.length, targetsMatched: matchedCandidateIds.size,
        rowsScanned: 0, recordsMatched: 0, enrichmentsWritten,
        lastSuccessfulRunAt: checkpoint?.last_successful_run_at ?? null, error: message,
      }).catch(() => undefined);
      await this.finishRun(runId, {
        status: 'failed', finishedAt, rowsScanned: 0, recordsMatched: 0,
        enrichmentsWritten, resourcesProcessed: 0, resourcesSkipped: 0,
        error: message,
        metadata: {
          mode: 'official_csv_targeted', resourceVersion, targetFingerprint,
          targetCount: targets.length, targetsMatched: matchedCandidateIds.size,
          coverageScope: 'canonical_reviewable_candidates',
        },
      }).catch(() => undefined);
      await this.updateSource(source, resource, {
        status: 'failed', finishedAt, targetFingerprint,
        targetCount: targets.length, targetsMatched: matchedCandidateIds.size,
        rowsScanned: 0, error: message,
      }).catch(() => undefined);
      return {
        status: 'failed', targetCount: targets.length,
        targetsMatched: matchedCandidateIds.size, rowsScanned: 0,
        registryRecordsMatched: 0, enrichmentsWritten,
        resourceVersion, targetFingerprint, error: message,
      };
    }
  }

  private enrichmentRow(
    candidateId: string,
    sourceId: string,
    record: CvmOpenCompanyRegistryRecord,
    observedAt: string,
  ) {
    return {
      candidate_id: candidateId,
      source_id: sourceId,
      dataset_code: DATASET_CODE,
      source_record_key: record.recordKey,
      entity_cnpj: record.cnpj,
      enrichment_type: 'cvm_open_company_registry',
      effective_date: record.effectiveDate,
      source_url: record.sourceUrl,
      content_hash: record.contentHash,
      data: {
        companyName: record.companyName,
        tradeName: record.tradeName,
        cvmCode: record.cvmCode,
        registrationDate: record.registrationDate,
        cancellationDate: record.cancellationDate,
        registrationSituation: record.registrationSituation,
        issuerSituation: record.issuerSituation,
        registrationCategory: record.registrationCategory,
        activitySector: record.activitySector,
        marketType: record.marketType,
        rawPayload: record.rawPayload,
      },
      observed_at: observedAt,
      updated_at: observedAt,
    };
  }

  private async saveCheckpoint(
    sourceId: string,
    resource: CvmOpenCompanyRegistryResource,
    checkpointKey: string,
    state: {
      status: 'completed' | 'failed'; resourceVersion: string;
      targetFingerprint: string; targetCount: number; targetsMatched: number;
      rowsScanned: number; recordsMatched: number; enrichmentsWritten: number;
      lastSuccessfulRunAt: string | null; error: string | null;
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
      resource_modified_at: resource.modifiedAt,
      etag: resource.etag,
      content_hash: hash({ resourceVersion: state.resourceVersion, targetFingerprint: state.targetFingerprint }),
      status: state.status,
      last_successful_run_at: state.lastSuccessfulRunAt,
      last_checked_at: checkedAt,
      rows_scanned: state.rowsScanned,
      records_matched: state.recordsMatched,
      error_message: state.error,
      metadata: {
        mode: 'official_csv_targeted', resourceVersion: state.resourceVersion,
        targetFingerprint: state.targetFingerprint, targetCount: state.targetCount,
        targetsMatched: state.targetsMatched, enrichmentsWritten: state.enrichmentsWritten,
        coverageScope: 'canonical_reviewable_candidates',
      },
      updated_at: checkedAt,
    }], 'dataset_code,resource_key');
  }

  private async finishRun(runId: string, state: {
    status: 'completed' | 'failed'; finishedAt: string; rowsScanned: number;
    recordsMatched: number; enrichmentsWritten: number;
    resourcesProcessed: number; resourcesSkipped: number;
    error?: string | null; metadata: Record<string, unknown>;
  }) {
    if (!this.client) return;
    await this.client.update('public_dataset_runs', {
      status: state.status,
      finished_at: state.finishedAt,
      resources_discovered: 1,
      resources_processed: state.resourcesProcessed,
      resources_skipped: state.resourcesSkipped,
      rows_scanned: state.rowsScanned,
      records_matched: state.recordsMatched,
      bronze_rows_written: 0,
      normalized_rows_written: state.enrichmentsWritten,
      outputs_written: 0,
      signals_written: 0,
      error_message: state.error ?? null,
      metadata: state.metadata,
      updated_at: state.finishedAt,
    }, [{ column: 'id', value: runId }]);
  }

  private async updateSource(
    source: SourceRow,
    resource: CvmOpenCompanyRegistryResource,
    state: {
      status: 'completed' | 'failed' | 'up_to_date'; finishedAt: string;
      targetFingerprint: string; targetCount: number; targetsMatched: number;
      rowsScanned: number; error: string | null;
    },
  ) {
    if (!this.client) return;
    await this.client.update('source_catalog', {
      status: state.error ? 'partial' : 'real',
      health: state.error ? 'degraded' : 'healthy',
      metadata: {
        ...(source.metadata ?? {}),
        implementedRuntime: true,
        implementationPhase: state.error ? 'candidate_enrichment_degraded' : 'candidate_enrichment_active',
        lastLoaderRunAt: state.finishedAt,
        lastLoaderStatus: state.status,
        lastLoaderError: state.error,
        lastRowsScanned: state.rowsScanned,
        targetFingerprint: state.targetFingerprint,
        targetCount: state.targetCount,
        targetsMatched: state.targetsMatched,
        targetCoverageAchieved: !state.error,
        coverageScope: 'canonical_reviewable_candidates',
        resourceModifiedAt: resource.modifiedAt,
        resourceEtag: resource.etag,
        fullCoverageAchieved: false,
      },
      updated_at: state.finishedAt,
    }, [{ column: 'id', value: source.id }]);
  }

  private async closeStaleRuns(now: string) {
    if (!this.client) return;
    const staleBefore = new Date(this.now().getTime() - STALE_RUN_MS).toISOString();
    await this.client.update('public_dataset_runs', {
      status: 'failed', finished_at: now,
      error_message: 'Automatically closed as stale before CVM candidate enrichment.',
      updated_at: now,
    }, [
      { column: 'dataset_code', value: DATASET_CODE },
      { column: 'status', value: 'running' },
      { column: 'started_at', operator: 'lt', value: staleBefore },
    ]).catch(() => undefined);
  }
}
