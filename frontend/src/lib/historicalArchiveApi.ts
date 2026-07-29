import { fetchWithPolicy } from './http';
import { supabaseRuntimeHeaders } from './supabaseRuntime';
import type { SessionData } from './types';

export type ArchiveRunStatus = 'queued' | 'running' | 'completed' | 'verified' | 'pruned' | 'failed';

export type HistoricalArchiveRun = {
  id: string;
  table_name: string;
  dataset_code: string | null;
  cutoff_at: string;
  include_raw_payload: boolean;
  chunk_rows: number;
  status: ArchiveRunStatus;
  storage_bucket: string;
  row_count: number;
  part_count: number;
  requested_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  verified_at: string | null;
  pruned_at: string | null;
  error_message: string | null;
  request_metadata: Record<string, unknown>;
  export_metadata: Record<string, unknown>;
  prune_result: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  size_bytes: number;
};

export type HistoricalArchivePart = {
  id: string;
  run_id: string;
  part_number: number;
  workbook_name: string;
  storage_bucket: string;
  storage_path: string;
  row_count: number;
  min_record_at: string | null;
  max_record_at: string | null;
  sha256: string;
  size_bytes: number;
  created_at: string;
};

export type HistoricalArchivePolicy = {
  table_name: string;
  dataset_code: string;
  retention_mode: 'full_row' | 'payload_only' | 'mirror_only';
  hot_retention_days: number;
  allow_prune: boolean;
  enabled: boolean;
  excel_sheet_prefix: string;
  notes: string | null;
};

export type HistoricalArchiveSummary = {
  runs: number;
  verified_runs: number;
  pruned_runs: number;
  failed_runs: number;
  running_runs: number;
  archived_rows: number;
  pruned_rows: number;
  storage_bytes: number;
  parts: number;
};

export type HistoricalArchiveCatalog = {
  status: 'ok';
  summary: HistoricalArchiveSummary;
  total: number;
  runs: HistoricalArchiveRun[];
  policies: HistoricalArchivePolicy[];
};

const runtimeFor = (session: SessionData) => supabaseRuntimeHeaders(session, 'Arquivo histórico');

const parse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    throw new Error(`Arquivo histórico retornou uma resposta inválida (${response.status}).`);
  }
  if (!response.ok) throw new Error(String(payload.error ?? payload.message ?? 'Falha ao consultar o arquivo histórico.'));
  return payload as T;
};

export const historicalArchiveApi = {
  async getCatalog(session: SessionData, filters?: { table?: string; status?: string; limit?: number; offset?: number }) {
    const { runtime, headers } = runtimeFor(session);
    const query = new URLSearchParams();
    if (filters?.table) query.set('table', filters.table);
    if (filters?.status) query.set('status', filters.status);
    query.set('limit', String(filters?.limit ?? 50));
    query.set('offset', String(filters?.offset ?? 0));
    const response = await fetchWithPolicy(`${runtime.url}/functions/v1/historical-excel-catalog?${query.toString()}`, { headers }, { timeoutMs: 20_000, retries: 1 });
    return parse<HistoricalArchiveCatalog>(response);
  },

  async getParts(session: SessionData, runId: string) {
    const { runtime, headers } = runtimeFor(session);
    const response = await fetchWithPolicy(`${runtime.url}/functions/v1/historical-excel-catalog?runId=${encodeURIComponent(runId)}`, { headers }, { timeoutMs: 20_000, retries: 1 });
    return parse<{ status: 'ok'; runId: string; parts: HistoricalArchivePart[] }>(response);
  },

  async createDownload(session: SessionData, partId: string) {
    const { runtime, headers } = runtimeFor(session);
    const response = await fetchWithPolicy(`${runtime.url}/functions/v1/historical-excel-catalog`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'download', partId }),
    }, { timeoutMs: 20_000 });
    return parse<{ status: 'ok'; signedUrl: string; workbookName: string; expiresIn: number }>(response);
  },

  async cleanupFailed(session: SessionData) {
    const { runtime, headers } = runtimeFor(session);
    const response = await fetchWithPolicy(`${runtime.url}/functions/v1/historical-excel-catalog`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'cleanup_failed' }),
    }, { timeoutMs: 28_000 });
    return parse<{
      status: 'cleaned';
      runs: number;
      deletedObjects: number;
      deletedParts: number;
      releasedBytes: number;
      deletedTokens: number;
    }>(response);
  },
};
