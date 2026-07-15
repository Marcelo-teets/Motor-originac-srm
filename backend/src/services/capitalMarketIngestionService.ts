import { getSupabaseClient } from '../lib/supabase.js';
import {
  CVM_DATASETS,
  discoverCvmResources,
  fetchCvmResourceRecords,
  type CvmDatasetCode,
  type CvmResource,
  type NormalizedCapitalMarketRecord,
} from '../modules/capital-markets/cvmCapitalMarketConnector.js';

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_ROWS = 100_000;
const ALL_DATASETS = Object.keys(CVM_DATASETS) as CvmDatasetCode[];

const chunks = <T>(items: T[], size = DEFAULT_BATCH_SIZE) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const resourceFingerprint = (resource: CvmResource) => [
  resource.id ?? resource.url,
  resource.last_modified ?? resource.created ?? 'unknown',
  resource.url,
].join('|');

export type CapitalMarketIngestionOptions = {
  datasets?: CvmDatasetCode[];
  reference?: string;
  maxRows?: number;
  triggerType?: 'manual' | 'schedule' | 'backfill';
};

export type CapitalMarketDatasetSummary = {
  datasetCode: CvmDatasetCode;
  status: 'completed' | 'partial' | 'failed';
  resourcesProcessed: number;
  resourcesSkipped: number;
  recordsSeen: number;
  bronzeRowsWritten: number;
  eventsWritten: number;
  signalsWritten: number;
  errors: string[];
};

type DatasetRunRow = {
  metadata?: {
    resourceFingerprints?: string[];
    skippedResourceFingerprints?: string[];
  };
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
    let signalsWritten = 0;

    const sourceRows = await this.client!.select('source_catalog', { select: 'id,name,metadata', limit: 1_000 }) as Array<{
      id: string;
      name: string;
      metadata?: Record<string, unknown>;
    }>;
    const sourceId = sourceRows.find((row) => row.metadata?.code === definition.sourceCode)?.id ?? null;

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
      const incremental = options.triggerType === 'schedule' && !options.reference;
      const previousFingerprints = incremental ? await this.previousResourceFingerprints(datasetCode) : new Set<string>();
      const resourcesToProcess: Array<{ resource: CvmResource; fingerprint: string }> = [];

      for (const resource of resources) {
        const fingerprint = resourceFingerprint(resource);
        if (incremental && previousFingerprints.has(fingerprint)) {
          resourcesSkipped += 1;
          skippedFingerprints.push(fingerprint);
        } else {
          resourcesToProcess.push({ resource, fingerprint });
        }
      }

      const perResourceBudget = resourcesToProcess.length
        ? Math.max(1, Math.floor(options.maxRows / resourcesToProcess.length))
        : 0;

      for (let index = 0; index < resourcesToProcess.length; index += 1) {
        const { resource, fingerprint } = resourcesToProcess[index];
        const remaining = options.maxRows - recordsSeen;
        if (remaining <= 0) break;
        const isLast = index === resourcesToProcess.length - 1;
        const maxRows = isLast ? remaining : Math.min(remaining, perResourceBudget);

        try {
          const records = await fetchCvmResourceRecords({ datasetCode, resource, maxRows, observedAt: startedAt });
          recordsSeen += records.length;
          resourcesProcessed += 1;
          processedFingerprints.push(fingerprint);
          const persisted = await this.persistRecords(records);
          bronzeRowsWritten += persisted.bronzeRowsWritten;
          eventsWritten += persisted.eventsWritten;
        } catch (error) {
          errors.push(`${resource.name}: ${errorMessage(error)}`);
        }
      }

      if (recordsSeen > 0) {
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

    const hadWorkOrCheckpoint = recordsSeen > 0 || resourcesSkipped > 0;
    const status: CapitalMarketDatasetSummary['status'] = !hadWorkOrCheckpoint
      ? 'failed'
      : errors.length
        ? 'partial'
        : 'completed';

    await this.client!.update('capital_market_dataset_runs', {
      status,
      finished_at: new Date().toISOString(),
      files_processed: resourcesProcessed,
      records_seen: recordsSeen,
      bronze_rows_written: bronzeRowsWritten,
      events_written: eventsWritten,
      signals_written: signalsWritten,
      error_message: errors.length ? errors.slice(0, 10).join(' | ') : null,
      metadata: {
        reference: options.reference ?? null,
        maxRows: options.maxRows,
        packageId: definition.packageId,
        sourceCode: definition.sourceCode,
        resourceFingerprints: processedFingerprints,
        skippedResourceFingerprints: skippedFingerprints,
        incremental: options.triggerType === 'schedule' && !options.reference,
        resourceBudgetStrategy: 'balanced_across_selected_resources',
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
      signalsWritten,
      errors,
    };
  }

  private async persistRecords(records: NormalizedCapitalMarketRecord[]) {
    let bronzeRowsWritten = 0;
    let eventsWritten = 0;
    for (const batch of chunks(records)) {
      const bronzeRows = await this.client!.upsert('bronze_historical_records', batch.map((record) => record.bronze), 'dataset_code,record_key') as unknown[];
      bronzeRowsWritten += bronzeRows.length;
      const eventRows = await this.client!.upsert('capital_market_events', batch.map((record) => record.event), 'dataset_code,record_key') as unknown[];
      eventsWritten += eventRows.length;
    }
    return { bronzeRowsWritten, eventsWritten };
  }
}
