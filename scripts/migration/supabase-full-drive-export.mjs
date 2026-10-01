import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MIGRATION_TABLES } from './neon-migration-manifest.mjs';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const SUPABASE_URL = required('SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');
const ARTIFACT_ONLY = String(process.env.ARTIFACT_ONLY ?? 'false').toLowerCase() === 'true';
const GOOGLE_DRIVE_CLIENT_ID = ARTIFACT_ONLY ? '' : required('GOOGLE_DRIVE_CLIENT_ID');
const GOOGLE_DRIVE_CLIENT_SECRET = ARTIFACT_ONLY ? '' : required('GOOGLE_DRIVE_CLIENT_SECRET');
const GOOGLE_DRIVE_REFRESH_TOKEN = ARTIFACT_ONLY ? '' : required('GOOGLE_DRIVE_REFRESH_TOKEN');
const TARGET_DRIVE_FOLDER_ID = ARTIFACT_ONLY ? '' : required('TARGET_DRIVE_FOLDER_ID');
const COPY_STORAGE_FILES = String(process.env.COPY_STORAGE_FILES ?? 'true').toLowerCase() !== 'false';
const PAGE_SIZE = Math.max(100, Math.min(Number(process.env.EXPORT_PAGE_SIZE ?? 1000) || 1000, 5000));
const MAX_ROWS_PER_SHEET = Math.max(1000, Math.min(Number(process.env.MAX_ROWS_PER_SHEET ?? 50000) || 50000, 100000));
const MAX_SHEET_CELLS = 4_000_000;
const EXPORT_ROOT = resolve(process.env.EXPORT_ROOT ?? resolve(process.env.RUNNER_TEMP ?? 'tmp', `motor-supabase-full-export-${Date.now()}`));
const TMP_DIR = resolve(EXPORT_ROOT, '_tmp');
const PROJECT_REF = 'hdghpmssudrqhsbvrdyt';

const safeName = (value, max = 120) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\\/:*?"<>|]+/g, '_')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max) || 'unnamed';

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  let text;
  if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

const jsonError = (error) => ({
  message: error instanceof Error ? error.message : String(error),
});

const fetchText = async (url, init = {}, timeoutMs = 60_000) => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  return { response, text };
};

let googleToken;
const googleAccessToken = async () => {
  if (googleToken && googleToken.expiresAt > Date.now() + 60_000) return googleToken.value;
  const { response, text } = await fetchText('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  }, 30_000);
  let payload = {};
  try { payload = JSON.parse(text); } catch {}
  if (!response.ok || !payload.access_token) throw new Error(`google_oauth_${response.status}`);
  googleToken = {
    value: String(payload.access_token),
    expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
  };
  return googleToken.value;
};

const googleJson = async (url, init = {}, timeoutMs = 60_000) => {
  const token = await googleAccessToken();
  const { response, text } = await fetchText(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  }, timeoutMs);
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 1000) }; }
  if (!response.ok) throw new Error(`google_${response.status}:${payload?.error?.message ?? 'request_failed'}`);
  return payload;
};

const escapeDriveQuery = (value) => String(value).replaceAll("'", "\\'");
const driveFolderCache = new Map();
const ensureDriveFolder = async (name, parentId, properties = {}) => {
  const key = `${parentId}/${name}`;
  if (driveFolderCache.has(key)) return driveFolderCache.get(key);
  const query = [
    `'${escapeDriveQuery(parentId)}' in parents`,
    `name='${escapeDriveQuery(name)}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
  ].join(' and ');
  const found = await googleJson(`https://www.googleapis.com/drive/v3/files?spaces=drive&q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=10`);
  if (found.files?.[0]?.id) {
    driveFolderCache.set(key, found.files[0].id);
    return found.files[0].id;
  }
  const created = await googleJson('https://www.googleapis.com/drive/v3/files?fields=id,name,parents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
      appProperties: properties,
    }),
  });
  driveFolderCache.set(key, created.id);
  return created.id;
};

const uploadResumable = async ({ filePath, name, parentId, sourceMimeType = 'application/octet-stream', convertToSheet = false, appProperties = {} }) => {
  const info = await stat(filePath);
  const token = await googleAccessToken();
  const metadata = {
    name,
    parents: [parentId],
    appProperties,
    ...(convertToSheet ? { mimeType: 'application/vnd.google-apps.spreadsheet' } : {}),
  };
  const start = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink,parents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': sourceMimeType,
      'x-upload-content-length': String(info.size),
    },
    body: JSON.stringify(metadata),
    signal: AbortSignal.timeout(60_000),
  });
  if (!start.ok) throw new Error(`drive_resumable_start_${start.status}`);
  const location = start.headers.get('location');
  if (!location) throw new Error('drive_resumable_location_missing');

  const upload = await fetch(location, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': sourceMimeType,
      'content-length': String(info.size),
    },
    body: createReadStream(filePath),
    duplex: 'half',
    signal: AbortSignal.timeout(20 * 60_000),
  });
  const text = await upload.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch {}
  if (!upload.ok) throw new Error(`drive_resumable_upload_${upload.status}:${payload?.error?.message ?? 'failed'}`);
  return payload;
};

const styleSheet = async (spreadsheetId) => {
  try {
    const meta = await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,gridProperties))`);
    const sheetId = meta?.sheets?.[0]?.properties?.sheetId;
    if (sheetId === undefined) return;
    await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
          { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.wrapStrategy' } },
        ],
      }),
    });
  } catch (error) {
    process.stderr.write(`WARN style sheet ${spreadsheetId}: ${jsonError(error).message}\n`);
  }
};

const supabaseHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
};

const supabaseJson = async (path, init = {}, timeoutMs = 60_000) => {
  const { response, text } = await fetchText(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...supabaseHeaders, ...(init.headers ?? {}) },
  }, timeoutMs);
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 1200) }; }
  if (!response.ok && response.status !== 206) {
    const hint = payload?.message ?? payload?.error ?? payload?.raw ?? 'request_failed';
    const error = new Error(`supabase_${response.status}:${String(hint).replace(/\s+/g, ' ').slice(0, 500)}`);
    error.status = response.status;
    throw error;
  }
  return { response, payload };
};

const readRepoTableCandidates = async () => {
  const names = new Set(MIGRATION_TABLES);
  try {
    const files = await readdir(resolve('db/migrations'), { recursive: true });
    for (const relative of files) {
      if (!String(relative).endsWith('.sql')) continue;
      const content = await readFile(resolve('db/migrations', relative), 'utf8');
      const regexes = [
        /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
        /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
      ];
      for (const regex of regexes) {
        for (const match of content.matchAll(regex)) names.add(match[1]);
      }
    }
  } catch (error) {
    process.stderr.write(`WARN migration scan: ${jsonError(error).message}\n`);
  }
  return names;
};

const discoverRestCatalog = async () => {
  const result = { tables: new Set(), headers: new Map(), status: 'unknown', error: null };
  try {
    const { response, payload } = await supabaseJson('/rest/v1/', { headers: { Accept: 'application/openapi+json' } }, 60_000);
    result.status = `http_${response.status}`;
    const paths = payload?.paths ?? {};
    for (const [path, methods] of Object.entries(paths)) {
      if (!path.startsWith('/') || path.startsWith('/rpc/')) continue;
      if (!methods?.get) continue;
      result.tables.add(decodeURIComponent(path.slice(1)));
    }
    const defs = payload?.definitions ?? payload?.components?.schemas ?? {};
    for (const [name, schema] of Object.entries(defs)) {
      const props = schema?.properties ? Object.keys(schema.properties) : [];
      if (props.length) result.headers.set(name, props);
    }
  } catch (error) {
    result.status = 'blocked';
    result.error = jsonError(error).message;
  }
  return result;
};

const openCsvPart = async ({ prefix, partNumber, headers }) => {
  const filePath = join(TMP_DIR, `${safeName(prefix, 80)}__part_${String(partNumber).padStart(3, '0')}.csv`);
  const handle = await open(filePath, 'w');
  await handle.write(headers.map(csvCell).join(',') + '\n');
  return { filePath, handle, rowCount: 0, hash: createHash('sha256') };
};

const writeCsvRow = async (part, headers, row) => {
  const line = headers.map((header) => csvCell(row?.[header])).join(',') + '\n';
  part.hash.update(line);
  await part.handle.write(line);
  part.rowCount += 1;
};

const closeAndUploadPart = async ({ part, logicalName, partNumber, rawFolderId, sheetsFolderId, manifestRows }) => {
  await part.handle.close();
  const rawName = basename(part.filePath);
  const digest = part.hash.digest('hex');

  if (ARTIFACT_ONLY) {
    await mkdir(rawFolderId, { recursive: true });
    const finalPath = join(rawFolderId, rawName);
    await rename(part.filePath, finalPath);
    manifestRows.push({
      scope: 'database',
      logical_name: logicalName,
      part: partNumber,
      rows: part.rowCount,
      sha256: digest,
      status: 'artifact_ok',
      raw_file_path: finalPath.replace(EXPORT_ROOT + '/', ''),
      raw_file_id: null,
      raw_url: null,
      sheet_file_id: null,
      sheet_url: null,
      error: null,
    });
    return;
  }

  const rawFile = await uploadResumable({
    filePath: part.filePath,
    name: rawName,
    parentId: rawFolderId,
    sourceMimeType: 'text/csv',
    appProperties: { sourceProject: PROJECT_REF, logicalName, sha256: digest },
  });

  let sheetFile = null;
  let sheetError = null;
  try {
    sheetFile = await uploadResumable({
      filePath: part.filePath,
      name: rawName.replace(/\.csv$/i, ''),
      parentId: sheetsFolderId,
      sourceMimeType: 'text/csv',
      convertToSheet: true,
      appProperties: { sourceProject: PROJECT_REF, logicalName, sha256: digest },
    });
    if (sheetFile?.id) await styleSheet(sheetFile.id);
  } catch (error) {
    sheetError = jsonError(error).message;
  }

  manifestRows.push({
    scope: 'database',
    logical_name: logicalName,
    part: partNumber,
    rows: part.rowCount,
    sha256: digest,
    status: sheetError ? 'raw_ok_sheet_failed' : 'ok',
    raw_file_id: rawFile?.id ?? null,
    raw_url: rawFile?.webViewLink ?? null,
    sheet_file_id: sheetFile?.id ?? null,
    sheet_url: sheetFile?.webViewLink ?? null,
    error: sheetError,
  });
  await rm(part.filePath, { force: true });
};

const fetchTablePage = async (table, offset) => {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`);
  url.searchParams.set('select', '*');
  const { response, text } = await fetchText(url, {
    headers: {
      ...supabaseHeaders,
      Accept: 'application/json',
      Range: `${offset}-${offset + PAGE_SIZE - 1}`,
      'Range-Unit': 'items',
    },
  }, 90_000);
  let rows;
  try { rows = text ? JSON.parse(text) : []; } catch { rows = null; }
  if (!response.ok && response.status !== 206) {
    const hint = rows?.message ?? rows?.error ?? text.slice(0, 500);
    const error = new Error(`HTTP ${response.status}: ${String(hint).replace(/\s+/g, ' ').slice(0, 400)}`);
    error.status = response.status;
    throw error;
  }
  if (!Array.isArray(rows)) throw new Error(`Unexpected payload for ${table}`);
  return rows;
};

const exportRestTable = async ({ table, schemaHeaders = [], rawFolderId, sheetsFolderId, manifestRows }) => {
  let offset = 0;
  let partNumber = 1;
  let headers = [...schemaHeaders];
  let current = null;
  let totalRows = 0;
  let rowsPerPart = MAX_ROWS_PER_SHEET;
  let hadAnyPage = false;

  for (;;) {
    const rows = await fetchTablePage(table, offset);
    hadAnyPage = true;
    if (!headers.length && rows.length) headers = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))];
    if (!headers.length && !rows.length) {
      manifestRows.push({ scope: 'database', logical_name: table, part: 0, rows: 0, status: 'empty_no_schema', error: null });
      return;
    }
    if (!current) {
      rowsPerPart = Math.max(1000, Math.min(MAX_ROWS_PER_SHEET, Math.floor(MAX_SHEET_CELLS / Math.max(1, headers.length))));
      current = await openCsvPart({ prefix: table, partNumber, headers });
    }

    for (const row of rows) {
      if (current.rowCount >= rowsPerPart) {
        await closeAndUploadPart({ part: current, logicalName: table, partNumber, rawFolderId, sheetsFolderId, manifestRows });
        partNumber += 1;
        current = await openCsvPart({ prefix: table, partNumber, headers });
      }
      await writeCsvRow(current, headers, row);
      totalRows += 1;
    }

    offset += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  if (current) await closeAndUploadPart({ part: current, logicalName: table, partNumber, rawFolderId, sheetsFolderId, manifestRows });
  if (!hadAnyPage) manifestRows.push({ scope: 'database', logical_name: table, part: 0, rows: 0, status: 'no_response', error: null });
  process.stdout.write(`TABLE ${table}: ${totalRows} rows\n`);
};

const exportRows = async ({ logicalName, rows, scope, rawFolderId, sheetsFolderId, manifestRows }) => {
  const headers = rows.length ? [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))] : ['_empty'];
  const rowsPerPart = Math.max(1000, Math.min(MAX_ROWS_PER_SHEET, Math.floor(MAX_SHEET_CELLS / Math.max(1, headers.length))));
  let partNumber = 1;
  let part = await openCsvPart({ prefix: logicalName, partNumber, headers });
  if (!rows.length) {
    await closeAndUploadPart({ part, logicalName, partNumber, rawFolderId, sheetsFolderId, manifestRows });
    manifestRows[manifestRows.length - 1].scope = scope;
    return;
  }
  for (const row of rows) {
    if (part.rowCount >= rowsPerPart) {
      await closeAndUploadPart({ part, logicalName, partNumber, rawFolderId, sheetsFolderId, manifestRows });
      manifestRows[manifestRows.length - 1].scope = scope;
      partNumber += 1;
      part = await openCsvPart({ prefix: logicalName, partNumber, headers });
    }
    await writeCsvRow(part, headers, row);
  }
  await closeAndUploadPart({ part, logicalName, partNumber, rawFolderId, sheetsFolderId, manifestRows });
  manifestRows[manifestRows.length - 1].scope = scope;
};

const listAuthUsers = async () => {
  const all = [];
  for (let page = 1; page <= 10000; page += 1) {
    const { payload } = await supabaseJson(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    const users = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : [];
    all.push(...users);
    if (users.length < 1000) break;
  }
  return all;
};

const listStorageBuckets = async () => {
  const { payload } = await supabaseJson('/storage/v1/bucket');
  return Array.isArray(payload) ? payload : [];
};

const listStorageObjects = async (bucketId) => {
  const rows = [];
  const queue = [''];
  const visited = new Set();
  while (queue.length) {
    const prefix = queue.shift();
    if (visited.has(prefix)) continue;
    visited.add(prefix);
    for (let offset = 0; ; offset += 1000) {
      const { payload } = await supabaseJson(`/storage/v1/object/list/${encodeURIComponent(bucketId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
      });
      const items = Array.isArray(payload) ? payload : [];
      for (const item of items) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        const isFolder = !item.id && !item.metadata;
        if (isFolder) {
          queue.push(fullPath);
          continue;
        }
        rows.push({ bucket_id: bucketId, full_path: fullPath, ...item });
      }
      if (items.length < 1000) break;
    }
  }
  return rows;
};

const ensureNestedDrivePath = async (rootId, relativePath) => {
  const parts = String(relativePath).split('/').filter(Boolean);
  let parent = rootId;
  for (const part of parts) parent = await ensureDriveFolder(safeName(part, 100), parent, { sourceProject: PROJECT_REF });
  return parent;
};

const downloadStorageObjectToFile = async ({ bucketId, fullPath }) => {
  const encodedPath = fullPath.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucketId)}/${encodedPath}`, {
    headers: supabaseHeaders,
    signal: AbortSignal.timeout(20 * 60_000),
  });
  if (!response.ok || !response.body) throw new Error(`storage_download_${response.status}`);
  const tempPath = join(TMP_DIR, `storage-${randomUUID()}-${safeName(basename(fullPath), 80)}`);
  const hash = createHash('sha256');
  let size = 0;
  const hasher = new Transform({
    transform(chunk, encoding, callback) {
      hash.update(chunk);
      size += chunk.length;
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), hasher, createWriteStream(tempPath));
  return {
    tempPath,
    sha256: hash.digest('hex'),
    size,
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
};

const copyStorageFiles = async ({ buckets, storageRowsByBucket, storageFilesFolderId, storageManifestRows }) => {
  if (!COPY_STORAGE_FILES) return;
  for (const bucket of buckets) {
    const bucketId = String(bucket.id ?? bucket.name ?? 'unknown');
    const bucketFolderId = await ensureDriveFolder(safeName(bucketId), storageFilesFolderId, { sourceBucket: bucketId, sourceProject: PROJECT_REF });
    const rows = storageRowsByBucket.get(bucketId) ?? [];
    for (const row of rows) {
      const fullPath = String(row.full_path ?? row.name ?? '');
      try {
        const slash = fullPath.lastIndexOf('/');
        const dir = slash >= 0 ? fullPath.slice(0, slash) : '';
        const fileName = slash >= 0 ? fullPath.slice(slash + 1) : fullPath;
        const parentId = dir ? await ensureNestedDrivePath(bucketFolderId, dir) : bucketFolderId;
        const downloaded = await downloadStorageObjectToFile({ bucketId, fullPath });
        if (ARTIFACT_ONLY) {
          const targetDir = dir ? join(bucketFolderId, ...dir.split('/').map((part) => safeName(part, 100))) : bucketFolderId;
          await mkdir(targetDir, { recursive: true });
          const targetPath = join(targetDir, safeName(fileName, 180));
          await rename(downloaded.tempPath, targetPath);
          storageManifestRows.push({
            bucket_id: bucketId,
            full_path: fullPath,
            source_size: row?.metadata?.size ?? downloaded.size,
            copied_size: downloaded.size,
            sha256: downloaded.sha256,
            local_path: targetPath.replace(EXPORT_ROOT + '/', ''),
            drive_file_id: null,
            drive_url: null,
            status: 'artifact_ok',
            error: null,
          });
        } else {
          const driveFile = await uploadResumable({
            filePath: downloaded.tempPath,
            name: safeName(fileName, 180),
            parentId,
            sourceMimeType: downloaded.contentType,
            appProperties: { sourceProject: PROJECT_REF, sourceBucket: bucketId, sourcePath: fullPath, sha256: downloaded.sha256 },
          });
          storageManifestRows.push({
            bucket_id: bucketId,
            full_path: fullPath,
            source_size: row?.metadata?.size ?? downloaded.size,
            copied_size: downloaded.size,
            sha256: downloaded.sha256,
            drive_file_id: driveFile?.id ?? null,
            drive_url: driveFile?.webViewLink ?? null,
            status: 'ok',
            error: null,
          });
          await rm(downloaded.tempPath, { force: true });
        }
      } catch (error) {
        storageManifestRows.push({
          bucket_id: bucketId,
          full_path: fullPath,
          source_size: row?.metadata?.size ?? null,
          copied_size: null,
          sha256: null,
          drive_file_id: null,
          drive_url: null,
          status: 'failed',
          error: jsonError(error).message,
        });
      }
    }
  }
};

const uploadJsonManifest = async (manifest, folderId) => {
  const path = ARTIFACT_ONLY ? join(folderId, 'export_manifest.json') : join(TMP_DIR, 'export_manifest.json');
  await mkdir(resolve(path, '..'), { recursive: true }).catch(() => {});
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
  if (ARTIFACT_ONLY) return { id: null, webViewLink: null, localPath: path.replace(EXPORT_ROOT + '/', '') };
  return uploadResumable({ filePath: path, name: 'export_manifest.json', parentId: folderId, sourceMimeType: 'application/json' });
};

const main = async () => {
  await mkdir(TMP_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  const manifestRows = [];
  const storageManifestRows = [];
  const blockedScopes = [];

  let rawFolderId;
  let sheetsFolderId;
  let storageFilesFolderId;
  let metaFolderId;
  if (ARTIFACT_ONLY) {
    rawFolderId = join(EXPORT_ROOT, '01 - CSV bruto (lossless)');
    sheetsFolderId = rawFolderId;
    storageFilesFolderId = join(EXPORT_ROOT, '03 - Supabase Storage - arquivos');
    metaFolderId = join(EXPORT_ROOT, '04 - Manifestos e auditoria');
    await Promise.all([rawFolderId, storageFilesFolderId, metaFolderId].map((dir) => mkdir(dir, { recursive: true })));
  } else {
    await googleAccessToken();
    rawFolderId = await ensureDriveFolder('01 - CSV bruto (lossless)', TARGET_DRIVE_FOLDER_ID, { sourceProject: PROJECT_REF });
    sheetsFolderId = await ensureDriveFolder('02 - Google Sheets', TARGET_DRIVE_FOLDER_ID, { sourceProject: PROJECT_REF });
    storageFilesFolderId = await ensureDriveFolder('03 - Supabase Storage - arquivos', TARGET_DRIVE_FOLDER_ID, { sourceProject: PROJECT_REF });
    metaFolderId = await ensureDriveFolder('04 - Manifestos e auditoria', TARGET_DRIVE_FOLDER_ID, { sourceProject: PROJECT_REF });
  }

  const repoCandidates = await readRepoTableCandidates();
  const catalog = await discoverRestCatalog();
  for (const table of catalog.tables) repoCandidates.add(table);

  const tableNames = [...repoCandidates]
    .filter((name) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))
    .sort((a, b) => a.localeCompare(b));

  process.stdout.write(`Discovered ${tableNames.length} database table/view candidates; REST catalog=${catalog.status}\n`);

  for (const table of tableNames) {
    try {
      await exportRestTable({
        table,
        schemaHeaders: catalog.headers.get(table) ?? [],
        rawFolderId,
        sheetsFolderId,
        manifestRows,
      });
    } catch (error) {
      manifestRows.push({ scope: 'database', logical_name: table, part: 0, rows: null, status: 'blocked_or_failed', error: jsonError(error).message });
      process.stderr.write(`TABLE FAIL ${table}: ${jsonError(error).message}\n`);
    }
  }

  try {
    const authUsers = await listAuthUsers();
    await exportRows({ logicalName: 'auth_users', rows: authUsers, scope: 'auth', rawFolderId, sheetsFolderId, manifestRows });
    process.stdout.write(`AUTH users: ${authUsers.length}\n`);
  } catch (error) {
    blockedScopes.push({ scope: 'auth_users', error: jsonError(error).message });
  }

  const storageRowsByBucket = new Map();
  let buckets = [];
  try {
    buckets = await listStorageBuckets();
    await exportRows({ logicalName: 'storage_buckets', rows: buckets, scope: 'storage_metadata', rawFolderId, sheetsFolderId, manifestRows });
    for (const bucket of buckets) {
      const bucketId = String(bucket.id ?? bucket.name ?? 'unknown');
      try {
        const rows = await listStorageObjects(bucketId);
        storageRowsByBucket.set(bucketId, rows);
        await exportRows({ logicalName: `storage_objects__${safeName(bucketId, 60)}`, rows, scope: 'storage_metadata', rawFolderId, sheetsFolderId, manifestRows });
        process.stdout.write(`STORAGE ${bucketId}: ${rows.length} objects\n`);
      } catch (error) {
        blockedScopes.push({ scope: `storage_objects:${bucketId}`, error: jsonError(error).message });
      }
    }
  } catch (error) {
    blockedScopes.push({ scope: 'storage_buckets', error: jsonError(error).message });
  }

  if (buckets.length && COPY_STORAGE_FILES) {
    await copyStorageFiles({ buckets, storageRowsByBucket, storageFilesFolderId, storageManifestRows });
    await exportRows({ logicalName: 'storage_file_copy_manifest', rows: storageManifestRows, scope: 'storage_files', rawFolderId, sheetsFolderId, manifestRows });
  }

  const finalManifest = {
    format: 'motor-supabase-full-drive-export-v1',
    projectRef: PROJECT_REF,
    startedAt,
    completedAt: new Date().toISOString(),
    targetDriveFolderId: TARGET_DRIVE_FOLDER_ID || null,
    exportRoot: ARTIFACT_ONLY ? EXPORT_ROOT : null,
    restCatalogStatus: catalog.status,
    restCatalogError: catalog.error,
    discoveredDatabaseObjects: tableNames.length,
    exportParts: manifestRows,
    storageCopies: storageManifestRows,
    blockedScopes,
    notes: [
      'Database export is sourced from Supabase PostgREST using the service-role credential.',
      'CSV files are the lossless tabular archive; native Google Sheets are convenience copies and may fail for provider cell limits.',
      'Auth export uses the supported Admin Users API; passwords, secret keys, refresh tokens, sessions, and credential secrets are intentionally not exported.',
      'Storage object files are copied byte-for-byte to Google Drive when the Storage API remains readable.',
    ],
  };

  const manifestFile = await uploadJsonManifest(finalManifest, metaFolderId);
  const indexRows = manifestRows.map((row) => ({
    scope: row.scope,
    logical_name: row.logical_name,
    part: row.part,
    rows: row.rows,
    status: row.status,
    raw_url: row.raw_url ?? null,
    sheet_url: row.sheet_url ?? null,
    sha256: row.sha256 ?? null,
    error: row.error ?? null,
  }));
  for (const blocked of blockedScopes) indexRows.push({ scope: blocked.scope, logical_name: blocked.scope, part: 0, rows: null, status: 'blocked', raw_url: null, sheet_url: null, sha256: null, error: blocked.error });
  await exportRows({ logicalName: 'EXPORT_INDEX', rows: indexRows, scope: 'manifest', rawFolderId: metaFolderId, sheetsFolderId: metaFolderId, manifestRows: [] });

  const summary = {
    status: blockedScopes.length || manifestRows.some((row) => String(row.status).includes('failed') || String(row.status).includes('blocked')) ? 'partial' : 'ok',
    projectRef: PROJECT_REF,
    targetDriveFolderId: TARGET_DRIVE_FOLDER_ID || null,
    exportRoot: ARTIFACT_ONLY ? EXPORT_ROOT : null,
    databaseObjectsAttempted: tableNames.length,
    exportPartsCreated: manifestRows.filter((row) => row.raw_file_id).length,
    storageObjectsCopied: storageManifestRows.filter((row) => row.status === 'ok').length,
    storageObjectsFailed: storageManifestRows.filter((row) => row.status !== 'ok').length,
    blockedScopes,
    manifestFileId: manifestFile?.id ?? null,
    manifestUrl: manifestFile?.webViewLink ?? null,
  };

  await writeFile(join(EXPORT_ROOT, 'run_summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.stdout.write(`FINAL_SUMMARY=${JSON.stringify(summary)}\n`);
};

main().catch(async (error) => {
  const summary = { status: 'failed', projectRef: PROJECT_REF, targetDriveFolderId: TARGET_DRIVE_FOLDER_ID || null, exportRoot: ARTIFACT_ONLY ? EXPORT_ROOT : null, error: jsonError(error).message };
  process.stderr.write(`FINAL_SUMMARY=${JSON.stringify(summary)}\n`);
  try {
    await mkdir(TMP_DIR, { recursive: true });
    await writeFile(join(EXPORT_ROOT, 'run_summary.json'), JSON.stringify(summary, null, 2) + '\n');
  } catch {}
  process.exitCode = 1;
});
