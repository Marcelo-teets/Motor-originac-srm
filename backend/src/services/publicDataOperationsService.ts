import { getSupabaseClient } from '../lib/supabase.js';

export type PublicDataOperationsSummary = {
  totalDatasets: number;
  healthyDatasets: number;
  runningDatasets: number;
  attentionDatasets: number;
  blockedDatasets: number;
  waitingDatasets: number;
  rowsScanned: number;
  recordsPersisted: number;
  outputsPersisted: number;
  signalsPersisted: number;
  registeredSources: number;
  targetCompaniesWithValidCnpj: number;
};

export type PublicDataOperationsBlocker = {
  code: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  nextAction: string;
};

export type PublicDataOperationsDataset = {
  datasetCode: string;
  sourceCode: string;
  displayName: string;
  sourceId: string | null;
  sourceName: string | null;
  sourceStatus: string;
  sourceHealth: string;
  cadence: string;
  executionMode: string;
  signalType: string;
  operationalStatus: 'healthy' | 'running' | 'attention' | 'blocked' | 'waiting';
  nextAction: string;
  latestRun: null | {
    id: string;
    triggerType: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    resourcesDiscovered: number;
    resourcesProcessed: number;
    resourcesSkipped: number;
    rowsScanned: number;
    recordsMatched: number;
    outputsWritten: number;
    signalsWritten: number;
    fullCoverageRequested: boolean;
    errorMessage: string | null;
  };
  lifetime: {
    runCount: number;
    checkpointCount: number;
    completedCheckpoints: number;
    failedCheckpoints: number;
    partialCheckpoints: number;
    rowsScanned: number;
    recordsMatched: number;
    recordsPersisted: number;
    matchedCompanyCount: number;
    outputsPersisted: number;
    signalsPersisted: number;
    lastSuccessfulRunAt: string | null;
    lastCheckedAt: string | null;
    latestRecordAt: string | null;
    latestOutputAt: string | null;
    latestSignalAt: string | null;
  };
};

export type PublicDataOperationsSnapshot = {
  generatedAt: string;
  summary: PublicDataOperationsSummary;
  blockers: PublicDataOperationsBlocker[];
  datasets: PublicDataOperationsDataset[];
};

const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const nullableText = (value: unknown) => typeof value === 'string' && value.length ? value : null;

export const emptyPublicDataOperationsSnapshot = (): PublicDataOperationsSnapshot => ({
  generatedAt: new Date().toISOString(),
  summary: {
    totalDatasets: 0,
    healthyDatasets: 0,
    runningDatasets: 0,
    attentionDatasets: 0,
    blockedDatasets: 0,
    waitingDatasets: 0,
    rowsScanned: 0,
    recordsPersisted: 0,
    outputsPersisted: 0,
    signalsPersisted: 0,
    registeredSources: 0,
    targetCompaniesWithValidCnpj: 0,
  },
  blockers: [],
  datasets: [],
});

export const normalizePublicDataOperationsSnapshot = (value: unknown): PublicDataOperationsSnapshot => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const summary = source.summary && typeof source.summary === 'object' ? source.summary as Record<string, unknown> : {};
  const rawBlockers = Array.isArray(source.blockers) ? source.blockers : [];
  const rawDatasets = Array.isArray(source.datasets) ? source.datasets : [];

  return {
    generatedAt: text(source.generatedAt, new Date().toISOString()),
    summary: {
      totalDatasets: numeric(summary.totalDatasets),
      healthyDatasets: numeric(summary.healthyDatasets),
      runningDatasets: numeric(summary.runningDatasets),
      attentionDatasets: numeric(summary.attentionDatasets),
      blockedDatasets: numeric(summary.blockedDatasets),
      waitingDatasets: numeric(summary.waitingDatasets),
      rowsScanned: numeric(summary.rowsScanned),
      recordsPersisted: numeric(summary.recordsPersisted),
      outputsPersisted: numeric(summary.outputsPersisted),
      signalsPersisted: numeric(summary.signalsPersisted),
      registeredSources: numeric(summary.registeredSources),
      targetCompaniesWithValidCnpj: numeric(summary.targetCompaniesWithValidCnpj),
    },
    blockers: rawBlockers.map((item) => {
      const blocker = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const severity = text(blocker.severity, 'medium');
      return {
        code: text(blocker.code, 'unknown_blocker'),
        severity: ['critical', 'high', 'medium', 'low'].includes(severity) ? severity as PublicDataOperationsBlocker['severity'] : 'medium',
        title: text(blocker.title, 'Bloqueio operacional'),
        detail: text(blocker.detail),
        nextAction: text(blocker.nextAction),
      };
    }),
    datasets: rawDatasets.map((item) => {
      const dataset = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const lifetime = dataset.lifetime && typeof dataset.lifetime === 'object' ? dataset.lifetime as Record<string, unknown> : {};
      const run = dataset.latestRun && typeof dataset.latestRun === 'object' ? dataset.latestRun as Record<string, unknown> : null;
      const operationalStatus = text(dataset.operationalStatus, 'waiting');
      return {
        datasetCode: text(dataset.datasetCode),
        sourceCode: text(dataset.sourceCode),
        displayName: text(dataset.displayName, text(dataset.datasetCode)),
        sourceId: nullableText(dataset.sourceId),
        sourceName: nullableText(dataset.sourceName),
        sourceStatus: text(dataset.sourceStatus, 'partial'),
        sourceHealth: text(dataset.sourceHealth, 'degraded'),
        cadence: text(dataset.cadence),
        executionMode: text(dataset.executionMode),
        signalType: text(dataset.signalType),
        operationalStatus: ['healthy', 'running', 'attention', 'blocked', 'waiting'].includes(operationalStatus)
          ? operationalStatus as PublicDataOperationsDataset['operationalStatus']
          : 'waiting',
        nextAction: text(dataset.nextAction),
        latestRun: run ? {
          id: text(run.id),
          triggerType: text(run.triggerType),
          status: text(run.status),
          startedAt: text(run.startedAt),
          finishedAt: nullableText(run.finishedAt),
          resourcesDiscovered: numeric(run.resourcesDiscovered),
          resourcesProcessed: numeric(run.resourcesProcessed),
          resourcesSkipped: numeric(run.resourcesSkipped),
          rowsScanned: numeric(run.rowsScanned),
          recordsMatched: numeric(run.recordsMatched),
          outputsWritten: numeric(run.outputsWritten),
          signalsWritten: numeric(run.signalsWritten),
          fullCoverageRequested: Boolean(run.fullCoverageRequested),
          errorMessage: nullableText(run.errorMessage),
        } : null,
        lifetime: {
          runCount: numeric(lifetime.runCount),
          checkpointCount: numeric(lifetime.checkpointCount),
          completedCheckpoints: numeric(lifetime.completedCheckpoints),
          failedCheckpoints: numeric(lifetime.failedCheckpoints),
          partialCheckpoints: numeric(lifetime.partialCheckpoints),
          rowsScanned: numeric(lifetime.rowsScanned),
          recordsMatched: numeric(lifetime.recordsMatched),
          recordsPersisted: numeric(lifetime.recordsPersisted),
          matchedCompanyCount: numeric(lifetime.matchedCompanyCount),
          outputsPersisted: numeric(lifetime.outputsPersisted),
          signalsPersisted: numeric(lifetime.signalsPersisted),
          lastSuccessfulRunAt: nullableText(lifetime.lastSuccessfulRunAt),
          lastCheckedAt: nullableText(lifetime.lastCheckedAt),
          latestRecordAt: nullableText(lifetime.latestRecordAt),
          latestOutputAt: nullableText(lifetime.latestOutputAt),
          latestSignalAt: nullableText(lifetime.latestSignalAt),
        },
      };
    }),
  };
};

export class PublicDataOperationsService {
  private readonly client = getSupabaseClient();

  async getSnapshot(): Promise<{ status: 'real' | 'partial'; snapshot: PublicDataOperationsSnapshot; note?: string }> {
    if (!this.client) {
      return {
        status: 'partial',
        snapshot: emptyPublicDataOperationsSnapshot(),
        note: 'Supabase não configurado no backend; snapshot operacional indisponível.',
      };
    }

    try {
      const payload = await this.client.rpc<unknown>('get_public_data_operations_snapshot', {});
      return { status: 'real', snapshot: normalizePublicDataOperationsSnapshot(payload) };
    } catch (error) {
      return {
        status: 'partial',
        snapshot: emptyPublicDataOperationsSnapshot(),
        note: `Falha ao carregar operação das fontes públicas: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
