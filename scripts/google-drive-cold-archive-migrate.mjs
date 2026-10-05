import { createHash } from 'node:crypto';
import { closeNeonPool, query } from './lib/neon-db.mjs';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const LEGACY_SUPABASE_URL = String(process.env.LEGACY_SUPABASE_URL ?? '').replace(/\/+$/, '');
const LEGACY_SUPABASE_SERVICE_ROLE_KEY = String(process.env.LEGACY_SUPABASE_SERVICE_ROLE_KEY ?? '');
const GOOGLE_DRIVE_CLIENT_ID = required('GOOGLE_DRIVE_CLIENT_ID');
const GOOGLE_DRIVE_CLIENT_SECRET = required('GOOGLE_DRIVE_CLIENT_SECRET');
const GOOGLE_DRIVE_REFRESH_TOKEN = required('GOOGLE_DRIVE_REFRESH_TOKEN');
const GOOGLE_DRIVE_ARCHIVE_FOLDER_ID = required('GOOGLE_DRIVE_ARCHIVE_FOLDER_ID');
const GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID = required('GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID');

const args = new Set(process.argv.slice(2));
const option = (name, fallback) => {
  const prefix = `--${name}=`;
  const found = [...args].find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};
const LIMIT = Math.max(1, Math.min(Number(option('limit', '25')) || 25, 100));
const DRY_RUN = args.has('--dry-run');
const DELETE_STAGING = args.has('--delete-staging');
const ALLOWED_RUN_STATUSES = new Set(['completed', 'verified', 'pruned']);

const encodeStoragePath = (path) => path.split('/').map(encodeURIComponent).join('/');
const escapeDriveQuery = (value) => String(value).replaceAll("'", "\\'");
const slug = (value) => String(value ?? 'all')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'all';

const requireLegacyStorage = () => {
  if (!LEGACY_SUPABASE_URL || !LEGACY_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('legacy_supabase_storage_credentials_missing');
  }
};

let googleToken;
const googleAccessToken = async () => {
  if (googleToken && googleToken.expiresAt > Date.now() + 60_000) return googleToken.value;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(`google_oauth_${response.status}:${JSON.stringify(payload).slice(0, 500)}`);
  googleToken = {
    value: String(payload.access_token),
    expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
  };
  return googleToken.value;
};

const google = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${await googleAccessToken()}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`google_${response.status}:${text.replace(/\s+/g, ' ').slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
};

const ensureFolder = async ({ name, parentId, properties = {} }) => {
  const q = [
    `'${escapeDriveQuery(parentId)}' in parents`,
    `name='${escapeDriveQuery(name)}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
  ].join(' and ');
  const found = await google(`https://www.googleapis.com/drive/v3/files?spaces=drive&q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`);
  if (found.files?.[0]?.id) return found.files[0].id;
  if (DRY_RUN) return `dry-run:${slug(name)}`;
  const created = await google('https://www.googleapis.com/drive/v3/files?fields=id,name,parents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
      appProperties: properties,
    }),
  });
  return created.id;
};

const downloadLegacyStagingObject = async (part) => {
  requireLegacyStorage();
  const response = await fetch(
    `${LEGACY_SUPABASE_URL}/storage/v1/object/${encodeURIComponent(part.storage_bucket)}/${encodeStoragePath(part.storage_path)}`,
    {
      headers: {
        apikey: LEGACY_SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${LEGACY_SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!response.ok) throw new Error(`legacy_storage_download_${response.status}:${(await response.text()).slice(0, 500)}`);
  return new Uint8Array(await response.arrayBuffer());
};

const uploadDriveFile = async ({ bytes, name, folderId, run, part }) => {
  if (DRY_RUN) return { id: `dry-run:${part.id}`, name, webViewLink: null, size: String(bytes.length) };
  const boundary = `origination_${crypto.randomUUID()}`;
  const metadata = {
    name,
    parents: [folderId],
    appProperties: {
      archiveRunId: run.id,
      archivePartId: part.id,
      archiveTable: run.table_name,
      archiveDataset: run.dataset_code ?? '*',
      archiveSha256: part.sha256,
    },
  };
  const encoder = new TextEncoder();
  const prefix = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
  );
  const suffix = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(prefix.length + bytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(bytes, prefix.length);
  body.set(suffix, prefix.length + bytes.length);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink,parents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await googleAccessToken()}`,
      'content-type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`drive_upload_${response.status}:${text.replace(/\s+/g, ' ').slice(0, 800)}`);
  return JSON.parse(text);
};

const appendManifest = async ({ run, part, file, folderId }) => {
  if (DRY_RUN) return;
  const externalUrl = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
  const values = [[
    run.id,
    run.table_name,
    run.dataset_code ?? '*',
    run.cutoff_at,
    part.part_number,
    file.id,
    file.name,
    externalUrl,
    part.row_count,
    part.min_record_at ?? '',
    part.max_record_at ?? '',
    part.size_bytes,
    part.sha256,
    'migrated',
    new Date().toISOString(),
    'google_drive',
    folderId,
  ]];
  await google(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID)}/values/${encodeURIComponent('MANIFESTO!A:Q')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values }) },
  );
};

const migratedMetadata = ({ part, file, stagingDeletedAt = null }) => ({
  ...(part.metadata ?? {}),
  migrated_from_provider: 'supabase_storage',
  migrated_from_bucket: part.storage_bucket,
  migrated_from_path: part.storage_path,
  google_file_name: file.name,
  google_reported_size: file.size ?? null,
  ...(stagingDeletedAt ? { staging_deleted_at: stagingDeletedAt } : {}),
});

const patchPart = async ({ part, file, folderId, stagingDeletedAt = null }) => {
  if (DRY_RUN) return;
  const externalUrl = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
  await query(
    `update public.data_archive_parts
        set storage_provider='google_drive',
            storage_bucket='google-drive',
            storage_path=$1,
            external_file_id=$2,
            external_folder_id=$3,
            external_url=$4,
            migrated_at=coalesce(migrated_at, now()),
            metadata=$5
      where id=$6`,
    [
      `${folderId}/${file.id}`,
      file.id,
      folderId,
      externalUrl,
      migratedMetadata({ part, file, stagingDeletedAt }),
      part.id,
    ],
  );
};

const deleteLegacyStagingObject = async ({ bucket, path }) => {
  if (!DELETE_STAGING || DRY_RUN) return false;
  requireLegacyStorage();
  const response = await fetch(
    `${LEGACY_SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: LEGACY_SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${LEGACY_SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`legacy_storage_delete_${response.status}:${(await response.text()).slice(0, 500)}`);
  }
  return true;
};

const cleanupMigratedLegacyStaging = async () => {
  const summary = { scanned: 0, deleted: 0, skipped: 0, failed: 0, errors: [] };
  if (!DELETE_STAGING || DRY_RUN) return summary;

  const migrated = await query(
    `select id, metadata
       from public.data_archive_parts
      where storage_provider='google_drive'
      order by migrated_at asc nulls last
      limit $1`,
    [LIMIT],
  );
  summary.scanned = migrated.length;

  for (const part of migrated) {
    try {
      const metadata = part.metadata ?? {};
      const bucket = String(metadata.migrated_from_bucket ?? '');
      const path = String(metadata.migrated_from_path ?? '');
      if (!bucket || !path || metadata.staging_deleted_at) {
        summary.skipped += 1;
        continue;
      }
      if (await deleteLegacyStagingObject({ bucket, path })) {
        await query(
          'update public.data_archive_parts set metadata=$1 where id=$2',
          [{ ...metadata, staging_deleted_at: new Date().toISOString() }, part.id],
        );
        summary.deleted += 1;
      }
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({ partId: part.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return summary;
};

const finalizeRunProvider = async (run) => {
  if (DRY_RUN) return;
  const remaining = await query(
    `select id from public.data_archive_parts
      where run_id=$1 and storage_provider <> 'google_drive'
      limit 1`,
    [run.id],
  );
  if (remaining.length) return;

  await query(
    `update public.data_archive_runs
        set storage_provider='google_drive',
            storage_bucket='google-drive',
            export_metadata=$1,
            updated_at=now()
      where id=$2`,
    [{
      ...(run.export_metadata ?? {}),
      final_storage_provider: 'google_drive',
      google_migrated_at: new Date().toISOString(),
    }, run.id],
  );
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const main = async () => {
  const cleanup = await cleanupMigratedLegacyStaging();
  const candidates = await query(
    `select *
       from public.data_archive_parts
      where storage_provider='supabase_storage'
        and external_file_id is null
      order by created_at asc
      limit $1`,
    [LIMIT],
  );

  const summary = {
    scanned: candidates.length,
    migrated: 0,
    skipped: 0,
    failed: 0,
    stagingDeleted: cleanup.deleted,
    cleanupScanned: cleanup.scanned,
    cleanupFailed: cleanup.failed,
    errors: [...cleanup.errors],
    metadataProvider: 'neon',
    finalStorageProvider: 'google_drive',
    legacyStagingProvider: 'supabase_storage',
  };

  for (const part of candidates) {
    try {
      const runs = await query('select * from public.data_archive_runs where id=$1 limit 1', [part.run_id]);
      const run = runs[0];
      if (!run || !ALLOWED_RUN_STATUSES.has(run.status)) {
        summary.skipped += 1;
        continue;
      }

      const bytes = await downloadLegacyStagingObject(part);
      const actualHash = sha256(bytes);
      if (actualHash !== part.sha256) throw new Error(`sha256_mismatch expected=${part.sha256} actual=${actualHash}`);
      if (Number(part.size_bytes) !== bytes.length) throw new Error(`size_mismatch expected=${part.size_bytes} actual=${bytes.length}`);

      const datasetFolder = await ensureFolder({
        name: `${slug(run.table_name)}__${slug(run.dataset_code ?? 'all')}`,
        parentId: GOOGLE_DRIVE_ARCHIVE_FOLDER_ID,
        properties: { archiveTable: run.table_name, archiveDataset: run.dataset_code ?? '*' },
      });
      const runFolder = await ensureFolder({
        name: `${String(run.cutoff_at).slice(0, 10)}__${run.id}`,
        parentId: datasetFolder,
        properties: { archiveRunId: run.id },
      });
      const file = await uploadDriveFile({ bytes, name: part.workbook_name, folderId: runFolder, run, part });
      await appendManifest({ run, part, file, folderId: runFolder });

      let stagingDeletedAt = null;
      if (await deleteLegacyStagingObject({ bucket: part.storage_bucket, path: part.storage_path })) {
        stagingDeletedAt = new Date().toISOString();
        summary.stagingDeleted += 1;
      }
      await patchPart({ part, file, folderId: runFolder, stagingDeletedAt });
      await finalizeRunProvider(run);
      summary.migrated += 1;
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({ partId: part.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    deleteStaging: DELETE_STAGING,
    ...summary,
  }, null, 2));
  if (summary.failed) process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeonPool().catch(() => undefined);
  });
