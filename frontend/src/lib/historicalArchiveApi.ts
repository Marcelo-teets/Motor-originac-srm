import type { SessionData } from './types';

export type ArchiveRunStatus = 'queued' | 'running' | 'completed' | 'verified' | 'pruned' | 'failed';
export type ArchiveStorageProvider = 'supabase_storage' | 'google_drive';

export type HistoricalArchiveRun = {
  id: string;
  table_name: string;
  dataset_code: string | null;
  cutoff_at: string;
  include_raw_payload: boolean;
  chunk_rows: number;
  status: ArchiveRunStatus;
  storage_provider: ArchiveStorageProvider;
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
  storage_provider: ArchiveStorageProvider;
  storage_bucket: string;
  storage_path: string;
  external_file_id: string | null;
  external_folder_id: string | null;
  external_url: string | null;
  migrated_at: string | null;
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
  supabase_storage_bytes: number;
  google_drive_bytes: number;
  parts: number;
};

export type DatabaseStorageHealth = {
  database_bytes: number;
  target_bytes: number;
  warning_bytes: number;
  critical_bytes: number;
  free_quota_bytes: number;
  state: 'healthy' | 'warning' | 'critical' | 'quota_exceeded';
  captured_at: string;
};

export type HistoricalArchiveCatalog = {
  status: 'ok';
  summary: HistoricalArchiveSummary;
  storage_health: DatabaseStorageHealth | null;
  total: number;
  runs: HistoricalArchiveRun[];
  policies: HistoricalArchivePolicy[];
};

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');

const requireConfig = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase não está configurado no frontend.');
  }
};

const headers = (session: SessionData) => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${session.access_token}`,
  'Content-Type': 'application/json',
});

const parse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
  if (!response.ok) throw new Error(String(payload.error ?? payload.message ?? 'Falha ao consultar o arquivo histórico.'));
  return payload as T;
};

const endpoint = () => `${supabaseUrl}/functions/v1/historical-excel-catalog`;

export const historicalArchiveApi = {
  async getCatalog(session: SessionData, filters?: { table?: string; status?: string; limit?: number; offset?: number }) {
    requireConfig();
    const query = new URLSearchParams();
    if (filters?.table) query.set('table', filters.table);
    if (filters?.status) query.set('status', filters.status);
    query.set('limit', String(filters?.limit ?? 50));
    query.set('offset', String(filters?.offset ?? 0));
    const response = await fetch(`${endpoint()}?${query.toString()}`, { headers: headers(session) });
    return parse<HistoricalArchiveCatalog>(response);
  },

  async getParts(session: SessionData, runId: string) {
    requireConfig();
    const response = await fetch(`${endpoint()}?runId=${encodeURIComponent(runId)}`, { headers: headers(session) });
    return parse<{ status: 'ok'; runId: string; parts: HistoricalArchivePart[] }>(response);
  },

  async createDownload(session: SessionData, partId: string) {
    requireConfig();
    const response = await fetch(endpoint(), {
      method: 'POST',
      headers: headers(session),
      body: JSON.stringify({ action: 'download', partId }),
    });
    return parse<{
      status: 'ok';
      provider: ArchiveStorageProvider;
      signedUrl: string;
      workbookName: string;
      expiresIn: number;
    }>(response);
  },

  async cleanupFailed(session: SessionData) {
    requireConfig();
    const response = await fetch(endpoint(), {
      method: 'POST',
      headers: headers(session),
      body: JSON.stringify({ action: 'cleanup_failed' }),
    });
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
