import { buildApiUrl } from './runtimeConfig';
import type { DataSourceKind, DataState, SessionData } from './types';

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

type PublicDataOperationsEnvelope = {
  status: DataSourceKind;
  generatedAt?: string;
  data?: PublicDataOperationsSnapshot;
  note?: string;
  error?: string;
};

export const emptyPublicDataOperations = (): PublicDataOperationsSnapshot => ({
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

const asStatus = (value: unknown): DataSourceKind => value === 'real' || value === 'mock' || value === 'partial' ? value : 'partial';

export async function getPublicDataOperations(session: SessionData | null): Promise<DataState<PublicDataOperationsSnapshot>> {
  try {
    const response = await fetch(buildApiUrl('/sources/public-operations'), {
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
    });
    const raw = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    if (!raw.trim() || !contentType.includes('application/json')) {
      return {
        source: 'partial',
        note: `Operação das fontes públicas indisponível. Status ${response.status}.`,
        data: emptyPublicDataOperations(),
      };
    }

    const payload = JSON.parse(raw) as PublicDataOperationsEnvelope;
    if (!response.ok || !payload.data) {
      return {
        source: 'partial',
        note: payload.error ?? payload.note ?? 'Operação das fontes públicas respondeu com atenção.',
        data: payload.data ?? emptyPublicDataOperations(),
      };
    }

    return {
      source: asStatus(payload.status),
      note: payload.note ?? 'Operação das fontes públicas carregada do Supabase.',
      data: payload.data,
    };
  } catch (error) {
    return {
      source: 'partial',
      note: error instanceof Error ? `Operação das fontes públicas indisponível: ${error.message}` : 'Operação das fontes públicas indisponível.',
      data: emptyPublicDataOperations(),
    };
  }
}
