import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyGodModeIdentity } from '../serverless/neon-auth.js';
import { requireNeonDataClient } from '../serverless/neon-data.js';
import { readJsonObjectBody } from './http-body.js';

const RUNTIME = 'historical-archive-neon-drive-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Origination-Runtime': RUNTIME,
  });
  res.end(JSON.stringify(payload));
};

const header = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const requestUrl = (req: IncomingMessage) => new URL(req.url ?? '/', `https://${header(req, 'host') ?? 'localhost'}`);

const readBody = (req: IncomingMessage) => readJsonObjectBody(req, 256_000);

const requireGodMode = async (req: IncomingMessage) => {
  const authorization = header(req, 'authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('authentication_required'), { statusCode: 401 });
  return verifyGodModeIdentity(authorization.slice('Bearer '.length));
};

const numberParam = (url: URL, name: string, fallback: number, max: number) => {
  const parsed = Number(url.searchParams.get(name) ?? fallback);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.trunc(parsed))) : fallback;
};

const listCatalog = async (url: URL) => {
  const db = requireNeonDataClient();
  const runId = url.searchParams.get('runId')?.trim() ?? '';
  if (runId) {
    if (!UUID_PATTERN.test(runId)) throw Object.assign(new Error('invalid_run_id'), { statusCode: 400 });
    const parts = await db.query(
      `select id, run_id, part_number, workbook_name, storage_bucket, storage_path,
              row_count, min_record_at, max_record_at, sha256, size_bytes, created_at,
              storage_provider, external_file_id, external_url, external_folder_id, migrated_at
         from public.data_archive_parts
        where run_id = $1
        order by part_number asc`,
      [runId],
    );
    return { status: 'ok', runId, parts };
  }

  const limit = Math.max(1, numberParam(url, 'limit', 50, 100));
  const offset = numberParam(url, 'offset', 0, 100_000);
  const tableName = url.searchParams.get('table')?.trim() ?? '';
  const status = url.searchParams.get('status')?.trim() ?? '';
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (tableName) { values.push(tableName); conditions.push(`r.table_name = $${values.length}`); }
  if (status) { values.push(status); conditions.push(`r.status = $${values.length}`); }
  values.push(limit, offset);
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const runs = await db.query(
    `select r.*,
            coalesce(sum(p.size_bytes), 0)::bigint as size_bytes
       from public.data_archive_runs r
       left join public.data_archive_parts p on p.run_id = r.id
       ${where}
      group by r.id
      order by r.created_at desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  const countValues = values.slice(0, values.length - 2);
  const countRows = await db.query<{ total: string }>(
    `select count(*)::text as total from public.data_archive_runs r ${where}`,
    countValues,
  );
  const policies = await db.query(
    `select table_name, dataset_code, retention_mode, hot_retention_days, allow_prune,
            enabled, excel_sheet_prefix, notes
       from public.data_archive_policies
      order by table_name, dataset_code`,
  );
  const summaryRows = await db.query<{
    runs: string; verified_runs: string; pruned_runs: string; failed_runs: string;
    running_runs: string; archived_rows: string; pruned_rows: string; storage_bytes: string; parts: string;
  }>(
    `select
       (select count(*) from public.data_archive_runs)::text as runs,
       (select count(*) from public.data_archive_runs where status='verified')::text as verified_runs,
       (select count(*) from public.data_archive_runs where status='pruned')::text as pruned_runs,
       (select count(*) from public.data_archive_runs where status='failed')::text as failed_runs,
       (select count(*) from public.data_archive_runs where status in ('queued','running','completed'))::text as running_runs,
       (select coalesce(sum(row_count),0) from public.data_archive_runs where status in ('verified','pruned'))::text as archived_rows,
       (select coalesce(sum(row_count),0) from public.data_archive_runs where status='pruned')::text as pruned_rows,
       (select coalesce(sum(size_bytes),0) from public.data_archive_parts)::text as storage_bytes,
       (select count(*) from public.data_archive_parts)::text as parts`,
  );
  const s = summaryRows[0] ?? {} as Record<string, string>;

  return {
    status: 'ok',
    summary: {
      runs: Number(s.runs ?? 0),
      verified_runs: Number(s.verified_runs ?? 0),
      pruned_runs: Number(s.pruned_runs ?? 0),
      failed_runs: Number(s.failed_runs ?? 0),
      running_runs: Number(s.running_runs ?? 0),
      archived_rows: Number(s.archived_rows ?? 0),
      pruned_rows: Number(s.pruned_rows ?? 0),
      storage_bytes: Number(s.storage_bytes ?? 0),
      parts: Number(s.parts ?? 0),
    },
    total: Number(countRows[0]?.total ?? runs.length),
    runs,
    policies,
  };
};

let googleToken: { value: string; expiresAt: number } | null = null;
const googleAccessToken = async () => {
  if (googleToken && googleToken.expiresAt > Date.now() + 60_000) return googleToken.value;
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? '';
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN ?? '';
  if (!clientId || !clientSecret || !refreshToken) {
    throw Object.assign(new Error('google_drive_credentials_missing'), { statusCode: 503 });
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || !payload.access_token) throw Object.assign(new Error('google_drive_oauth_failed'), { statusCode: 502 });
  googleToken = { value: String(payload.access_token), expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000 };
  return googleToken.value;
};

const deleteDriveFile = async (fileId: string) => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${await googleAccessToken()}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`google_drive_delete_${response.status}`);
  }
};

const downloadInfo = async (partId: string) => {
  if (!UUID_PATTERN.test(partId)) throw Object.assign(new Error('invalid_part_id'), { statusCode: 400 });
  const rows = await requireNeonDataClient().query<{
    id: string; workbook_name: string; storage_provider: string | null;
    external_file_id: string | null; external_url: string | null;
  }>(
    `select id, workbook_name, storage_provider, external_file_id, external_url
       from public.data_archive_parts where id = $1 limit 1`,
    [partId],
  );
  const part = rows[0];
  if (!part) throw Object.assign(new Error('archive_part_not_found'), { statusCode: 404 });
  if (part.storage_provider !== 'google_drive' || !part.external_file_id) {
    throw Object.assign(new Error('archive_part_pending_google_drive_migration'), { statusCode: 409 });
  }
  return {
    status: 'ok',
    partId,
    workbookName: part.workbook_name,
    expiresIn: 0,
    signedUrl: part.external_url ?? `https://drive.google.com/file/d/${part.external_file_id}/view`,
    storageProvider: 'google_drive',
  };
};

const cleanupFailed = async () => {
  const db = requireNeonDataClient();
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const runs = await db.query<{ id: string; request_metadata: Record<string, unknown>; export_metadata: Record<string, unknown> }>(
    `select id, request_metadata, export_metadata
       from public.data_archive_runs
      where status='failed'
        and coalesce(completed_at, created_at) < $1
      limit 200`,
    [cutoff],
  );

  let deletedObjects = 0;
  let deletedParts = 0;
  let releasedBytes = 0;
  let skippedLegacyStorage = 0;

  for (const run of runs) {
    const parts = await db.query<{ id: string; storage_provider: string | null; external_file_id: string | null; size_bytes: number }>(
      `select id, storage_provider, external_file_id, size_bytes
         from public.data_archive_parts where run_id = $1`,
      [run.id],
    );
    const removable: string[] = [];
    for (const part of parts) {
      if (part.storage_provider !== 'google_drive' || !part.external_file_id) {
        skippedLegacyStorage += 1;
        continue;
      }
      await deleteDriveFile(part.external_file_id);
      deletedObjects += 1;
      releasedBytes += Number(part.size_bytes ?? 0);
      removable.push(part.id);
    }
    if (removable.length) {
      await db.delete('data_archive_parts', [{ column: 'id', operator: 'in', value: removable }]);
      deletedParts += removable.length;
    }
    await db.update('data_archive_runs', {
      part_count: Math.max(0, parts.length - removable.length),
      request_metadata: { ...(run.request_metadata ?? {}), cleanup: {
        cleaned_at: new Date().toISOString(),
        deleted_objects: removable.length,
        released_bytes: releasedBytes,
        reason: 'failed_run_artifact_cleanup',
      } },
      export_metadata: { ...(run.export_metadata ?? {}), failed_artifacts_cleaned: skippedLegacyStorage === 0 },
      updated_at: new Date().toISOString(),
    }, [{ column: 'id', operator: 'eq', value: run.id }]);
  }

  const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const expired = await db.query<{ id: string }>(
    `select id from public.data_archive_tokens where expires_at < $1 limit 5000`,
    [staleCutoff],
  );
  if (expired.length) await db.delete('data_archive_tokens', [{ column: 'id', operator: 'in', value: expired.map((row) => row.id) }]);

  return {
    status: skippedLegacyStorage ? 'partial' : 'cleaned',
    runs: runs.length,
    deletedObjects,
    deletedParts,
    releasedBytes,
    deletedTokens: expired.length,
    skippedLegacyStorage,
  };
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await requireGodMode(req);
    const method = (req.method ?? 'GET').toUpperCase();

    if (method === 'GET') {
      writeJson(res, 200, await listCatalog(requestUrl(req)));
      return;
    }
    if (method !== 'POST') {
      writeJson(res, 405, { status: 'error', error: 'method_not_allowed' });
      return;
    }

    const body = await readBody(req);
    const action = String(body.action ?? '');
    if (action === 'download') {
      writeJson(res, 200, await downloadInfo(String(body.partId ?? '')));
      return;
    }
    if (action === 'cleanup_failed') {
      const result = await cleanupFailed();
      writeJson(res, result.status === 'cleaned' ? 200 : 207, result);
      return;
    }
    writeJson(res, 400, { status: 'error', error: 'unsupported_action' });
  } catch (error) {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode) || 500
      : error instanceof SyntaxError ? 400 : 500;
    console.error('[historical-archive]', error);
    writeJson(res, statusCode, { status: 'error', error: error instanceof Error ? error.message : String(error) });
  }
}
