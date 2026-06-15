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

const asCaptureStatus = (value: unknown): DataSourceKind => {
  if (value === 'real' || value === 'mock' || value === 'partial') return value;
  return 'partial';
};

async function readCapturePayload(response: Response): Promise<CaptureHealth & { error?: string }> {
  const raw = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  if (!raw.trim()) {
    return { ...emptyCaptureHealth(), error: response.ok ? undefined : `${response.status} ${response.statusText || 'Empty response'}` };
  }

  if (!contentType.includes('application/json')) {
    return {
      ...emptyCaptureHealth(),
      error: `Healthcheck retornou resposta não-JSON. Status ${response.status}. Preview: ${raw.replace(/\s+/g, ' ').slice(0, 140)}`,
    };
  }

  try {
    const payload = JSON.parse(raw) as CaptureHealth & { error?: string };
    return {
      ...emptyCaptureHealth(),
      ...payload,
      status: asCaptureStatus(payload.status),
      tables: Array.isArray(payload.tables) ? payload.tables : [],
    };
  } catch {
    return { ...emptyCaptureHealth(), error: `Healthcheck retornou JSON inválido. Status ${response.status}.` };
  }
}

export async function getCaptureHealth(): Promise<DataState<CaptureHealth>> {
  try {
    const response = await fetch(buildApiUrl('/data-capture/health'));
    const payload = await readCapturePayload(response);

    if (!response.ok) {
      return {
        source: 'partial',
        note: payload.error ?? 'Healthcheck da captura respondeu com atenção operacional.',
        data: { ...emptyCaptureHealth(), ...payload, status: asCaptureStatus(payload.status) },
      };
    }

    return {
      source: asCaptureStatus(payload.status),
      note: payload.error ?? 'Healthcheck da captura carregado do runtime serverless oficial.',
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
