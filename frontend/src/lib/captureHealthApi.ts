import { buildApiUrl } from './runtimeConfig';
import type { DataSourceKind, DataState } from './types';

export type CaptureHealthTable = {
  table: string;
  ok: boolean;
  count: number | null;
  error?: string | null;
};

export type CaptureHealth = {
  status: DataSourceKind;
  generatedAt?: string;
  requestPath?: string;
  env?: Record<string, unknown>;
  captureRuntime?: {
    canRunAgainstSupabase?: boolean;
    canAuthorizeWorkflow?: boolean;
    coreTablesAccessible?: boolean;
  };
  tables: CaptureHealthTable[];
};

const emptyCaptureHealth = (): CaptureHealth => ({
  status: 'partial',
  generatedAt: new Date().toISOString(),
  captureRuntime: {
    canRunAgainstSupabase: false,
    canAuthorizeWorkflow: false,
    coreTablesAccessible: false,
  },
  tables: [],
});

export async function getCaptureHealth(): Promise<DataState<CaptureHealth>> {
  try {
    const response = await fetch(buildApiUrl('/data-capture/health'));
    const payload = await response.json() as CaptureHealth & { error?: string };

    if (!response.ok) {
      return {
        source: 'partial',
        note: payload.error ?? 'Healthcheck da captura respondeu com atenção operacional.',
        data: { ...emptyCaptureHealth(), ...payload, status: payload.status ?? 'partial' },
      };
    }

    return {
      source: payload.status,
      note: 'Healthcheck da captura carregado do runtime serverless oficial.',
      data: payload,
    };
  } catch (error) {
    return {
      source: 'partial',
      note: error instanceof Error ? `Healthcheck da captura indisponível: ${error.message}` : 'Healthcheck da captura indisponível.',
      data: emptyCaptureHealth(),
    };
  }
}
