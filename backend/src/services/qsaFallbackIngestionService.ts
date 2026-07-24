import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { fetchBrasilApiQsaFallback } from '../modules/public-data/brasilApiQsaFallback.js';
import {
  isEligibleStrategicMonitoringTarget,
  type StrategicTargetCompanyRow,
} from './strategicPublicIngestionService.js';

export type QsaFallbackRunOptions = {
  companyId?: string;
  triggerType?: 'manual' | 'schedule' | 'backfill';
  force?: boolean;
  maxCompanies?: number;
};

type SourceRow = {
  id: string;
  status: string;
  health: string;
  metadata?: Record<string, unknown> | null;
};

type PersistResult = {
  status?: string;
  companyId?: string;
  bronzeRowsWritten?: number;
  recordsWritten?: number;
  outputsWritten?: number;
  signalsWritten?: number;
};

export const shouldUseQsaFallback = (source: SourceRow | null | undefined, force = false) => {
  if (force) return true;
  if (!source) return true;
  const metadata = source.metadata ?? {};
  return source.status !== 'real'
    || source.health !== 'healthy'
    || metadata.officialBulkHealth === 'degraded'
    || metadata.fullCoverageAchieved !== true;
};

const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export class QsaFallbackIngestionService {
  private readonly client = getSupabaseClient();

  async run(options: QsaFallbackRunOptions = {}) {
    const startedAt = new Date().toISOString();
    const triggerType = options.triggerType ?? 'manual';
    const maxCompanies = Math.max(1, Math.min(options.maxCompanies ?? 500, 5_000));

    if (!this.client) {
      return {
        status: 'failed' as const,
        generatedAt: new Date().toISOString(),
        error: 'Supabase client is not configured for QSA fallback ingestion.',
        companies: [],
      };
    }

    const [companyRows, sourceRows] = await Promise.all([
      this.client.select('companies', {
        select: 'id,cnpj,metadata',
        limit: 50_000,
      }) as Promise<StrategicTargetCompanyRow[]>,
      this.client.select('source_catalog', {
        select: 'id,status,health,metadata',
        limit: 2_000,
      }) as Promise<SourceRow[]>,
    ]);

    const officialSource = sourceRows.find((source) => source.metadata?.code === 'src_rfb_qsa_bulk');
    const fallbackSource = sourceRows.find((source) => source.metadata?.code === 'src_brasilapi_cnpj');
    if (!fallbackSource) {
      return {
        status: 'failed' as const,
        generatedAt: new Date().toISOString(),
        error: 'BrasilAPI source catalog entry was not found.',
        companies: [],
      };
    }

    if (!shouldUseQsaFallback(officialSource, options.force)) {
      return {
        status: 'real' as const,
        generatedAt: new Date().toISOString(),
        skipped: true,
        reason: 'official_qsa_bulk_is_healthy_and_complete',
        companies: [],
      };
    }

    const targets = companyRows
      .filter(isEligibleStrategicMonitoringTarget)
      .filter((company) => !options.companyId || company.id === options.companyId)
      .slice(0, maxCompanies);

    if (!targets.length) {
      return {
        status: 'partial' as const,
        generatedAt: new Date().toISOString(),
        error: options.companyId
          ? 'Requested company is not eligible for QSA fallback monitoring.'
          : 'No real, identity-verified companies are eligible for QSA fallback monitoring.',
        companies: [],
      };
    }

    const runId = randomUUID();
    await this.client.insert('public_dataset_runs', [{
      id: runId,
      dataset_code: 'rfb_qsa_fallback',
      source_id: fallbackSource.id,
      trigger_type: triggerType,
      status: 'running',
      started_at: startedAt,
      metadata: {
        sourceHierarchy: ['rfb_official_bulk', 'brasilapi_qsa_fallback'],
        selectedSource: 'brasilapi_qsa_fallback',
        sourceAuthority: 'secondary_public_api',
        officialBulkHealth: officialSource?.health ?? 'missing',
        targetCompanyCount: targets.length,
        force: options.force ?? false,
      },
    }]);

    const companyResults: Array<Record<string, unknown>> = [];
    let recordsMatched = 0;
    let bronzeRowsWritten = 0;
    let recordsWritten = 0;
    let outputsWritten = 0;
    const errors: string[] = [];

    for (const company of targets) {
      const fallback = await fetchBrasilApiQsaFallback(company.cnpj ?? '');
      if (fallback.status !== 'real') {
        errors.push(`${company.id}: ${fallback.error ?? 'QSA fallback failed.'}`);
        companyResults.push({
          companyId: company.id,
          status: 'failed',
          error: fallback.error ?? 'QSA fallback failed.',
        });
        continue;
      }

      try {
        const persisted = await this.client.rpc<PersistResult>('persist_qsa_fallback_snapshot', {
          p_company_id: company.id,
          p_records: fallback.records,
          p_observed_at: fallback.observedAt,
        });
        recordsMatched += fallback.records.length;
        bronzeRowsWritten += asNumber(persisted?.bronzeRowsWritten);
        recordsWritten += asNumber(persisted?.recordsWritten);
        outputsWritten += asNumber(persisted?.outputsWritten);
        companyResults.push({
          companyId: company.id,
          status: 'completed',
          sourceAuthority: fallback.sourceAuthority,
          sourceConfidence: fallback.sourceConfidence,
          recordsMatched: fallback.records.length,
          outputsWritten: asNumber(persisted?.outputsWritten),
          signalsWritten: 0,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${company.id}: ${message}`);
        companyResults.push({ companyId: company.id, status: 'failed', error: message });
      }
    }

    const successfulCompanies = companyResults.filter((company) => company.status === 'completed').length;
    const status = successfulCompanies === 0
      ? 'failed'
      : errors.length ? 'partial' : 'completed';
    const finishedAt = new Date().toISOString();

    await this.client.update('public_dataset_runs', {
      status,
      finished_at: finishedAt,
      resources_discovered: targets.length,
      resources_processed: successfulCompanies,
      resources_skipped: 0,
      rows_scanned: targets.length,
      records_matched: recordsMatched,
      bronze_rows_written: bronzeRowsWritten,
      normalized_rows_written: recordsWritten,
      outputs_written: outputsWritten,
      signals_written: 0,
      error_message: errors.length ? errors.slice(0, 10).join(' | ') : null,
      metadata: {
        sourceHierarchy: ['rfb_official_bulk', 'brasilapi_qsa_fallback'],
        selectedSource: 'brasilapi_qsa_fallback',
        sourceAuthority: 'secondary_public_api',
        sourceConfidence: 0.78,
        officialBulkHealth: officialSource?.health ?? 'missing',
        targetCompanyCount: targets.length,
        successfulCompanies,
        errors,
      },
      updated_at: finishedAt,
    }, [{ column: 'id', value: runId }]);

    return {
      status: status === 'completed' ? 'real' as const : status === 'partial' ? 'partial' as const : 'failed' as const,
      generatedAt: finishedAt,
      runId,
      sourceAuthority: 'secondary_public_api' as const,
      sourceConfidence: 0.78,
      officialBulkHealth: officialSource?.health ?? 'missing',
      totals: {
        companiesRequested: targets.length,
        companiesSucceeded: successfulCompanies,
        recordsMatched,
        bronzeRowsWritten,
        recordsWritten,
        outputsWritten,
        signalsWritten: 0,
      },
      companies: companyResults,
      errors,
    };
  }
}
