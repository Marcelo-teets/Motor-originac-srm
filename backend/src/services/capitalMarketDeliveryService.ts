import { getSupabaseClient } from '../lib/supabase.js';
import type { CvmDatasetCode } from '../modules/capital-markets/cvmCapitalMarketConnector.js';

type RawDeliveryResult = {
  datasetCode?: unknown;
  eventCount?: unknown;
  linkedEvents?: unknown;
  signalsWritten?: unknown;
  candidatesUpserted?: unknown;
  generatedAt?: unknown;
};

export type CapitalMarketDeliveryDatasetSummary = {
  datasetCode: CvmDatasetCode;
  status: 'completed' | 'failed';
  eventCount: number;
  linkedEvents: number;
  signalsWritten: number;
  candidatesUpserted: number;
  generatedAt: string;
  error: string | null;
};

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeCapitalMarketDeliveryResult = (
  datasetCode: CvmDatasetCode,
  raw: RawDeliveryResult | null | undefined,
): CapitalMarketDeliveryDatasetSummary => ({
  datasetCode,
  status: 'completed',
  eventCount: numberValue(raw?.eventCount),
  linkedEvents: numberValue(raw?.linkedEvents),
  signalsWritten: numberValue(raw?.signalsWritten),
  candidatesUpserted: numberValue(raw?.candidatesUpserted),
  generatedAt: typeof raw?.generatedAt === 'string' ? raw.generatedAt : new Date().toISOString(),
  error: null,
});

const failedSummary = (datasetCode: CvmDatasetCode, error: unknown): CapitalMarketDeliveryDatasetSummary => ({
  datasetCode,
  status: 'failed',
  eventCount: 0,
  linkedEvents: 0,
  signalsWritten: 0,
  candidatesUpserted: 0,
  generatedAt: new Date().toISOString(),
  error: error instanceof Error ? error.message : String(error),
});

export class CapitalMarketDeliveryService {
  private readonly client = getSupabaseClient();

  async sync(datasets: CvmDatasetCode[]) {
    if (!this.client) throw new Error('Supabase client not configured for capital-market delivery.');

    const requested = [...new Set(datasets)];
    const summaries: CapitalMarketDeliveryDatasetSummary[] = [];

    for (const datasetCode of requested) {
      try {
        const raw = await this.client.rpc<RawDeliveryResult>('sync_capital_market_delivery', {
          p_dataset_code: datasetCode,
        });
        summaries.push(normalizeCapitalMarketDeliveryResult(datasetCode, raw));
      } catch (error) {
        summaries.push(failedSummary(datasetCode, error));
      }
    }

    const completed = summaries.filter((summary) => summary.status === 'completed').length;
    const status = summaries.length > 0 && completed === summaries.length
      ? 'real'
      : completed > 0
        ? 'partial'
        : 'failed';

    return {
      status,
      generatedAt: new Date().toISOString(),
      requested,
      totals: {
        datasets: summaries.length,
        completed,
        failed: summaries.length - completed,
        eventCount: summaries.reduce((sum, item) => sum + item.eventCount, 0),
        linkedEvents: summaries.reduce((sum, item) => sum + item.linkedEvents, 0),
        signalsWritten: summaries.reduce((sum, item) => sum + item.signalsWritten, 0),
        candidatesUpserted: summaries.reduce((sum, item) => sum + item.candidatesUpserted, 0),
      },
      datasets: summaries,
    };
  }
}
