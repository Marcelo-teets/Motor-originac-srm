import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import ExcelJS from "npm:exceljs@4.4.0";

const RUNTIME = "historical-excel-export-v6";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ARCHIVE_BUCKET = "historical-excel-archive";
const ARCHIVE_STORAGE_PROVIDER = Deno.env.get("ARCHIVE_STORAGE_PROVIDER") === "google_drive"
  ? "google_drive"
  : "supabase_storage";
const GOOGLE_DRIVE_CLIENT_ID = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID") ?? "";
const GOOGLE_DRIVE_CLIENT_SECRET = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET") ?? "";
const GOOGLE_DRIVE_REFRESH_TOKEN = Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN") ?? "";
const GOOGLE_DRIVE_ARCHIVE_FOLDER_ID = Deno.env.get("GOOGLE_DRIVE_ARCHIVE_FOLDER_ID") ?? "";
const GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID = Deno.env.get("GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID") ?? "";
const MAX_CELL_CHARS = 32_000;
const MAX_ROWS_PER_INVOCATION = 1_000;
const encoder = new TextEncoder();

type ArchiveProvider = "supabase_storage" | "google_drive";

type TableConfig = {
  dateColumn: string;
  datasetColumn?: string;
  resource: string;
};

type StoredArchivePart = {
  provider: ArchiveProvider;
  storageBucket: string;
  storagePath: string;
  externalFileId: string | null;
  externalFolderId: string | null;
  externalUrl: string | null;
  metadata: Record<string, unknown>;
};

const TABLE_CONFIG: Record<string, TableConfig> = {
  capital_market_events: {
    dateColumn: "observed_at",
    datasetColumn: "dataset_code",
    resource: "historical_archive_capital_market_events",
  },
  bronze_historical_records: {
    dateColumn: "ingested_at",
    datasetColumn: "dataset_code",
    resource: "bronze_historical_records",
  },
  source_documents: {
    dateColumn: "observed_at",
    resource: "historical_archive_source_documents",
  },
  monitoring_outputs: {
    dateColumn: "observed_at",
    resource: "historical_archive_monitoring_outputs",
  },
  company_signals: { dateColumn: "observed_at", resource: "company_signals" },
  company_factor_observations: { dateColumn: "observed_at", resource: "company_factor_observations" },
  score_snapshots: { dateColumn: "created_at", resource: "score_snapshots" },
  qualification_snapshots: { dateColumn: "created_at", resource: "qualification_snapshots" },
  lead_score_snapshots: { dateColumn: "created_at", resource: "lead_score_snapshots" },
};

let googleTokenCache: { accessToken: string; expiresAt: number } | null = null;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-origination-runtime": RUNTIME,
    },
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function sha256Hex(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("supabase_runtime_credentials_missing");
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase_http_${response.status}:${text.replace(/\s+/g, " ").slice(0, 800)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function claimToken(rawToken: string): Promise<Record<string, unknown>> {
  if (!rawToken || rawToken.length < 32) throw new Error("invalid_archive_token");
  const claim = await supabaseFetch("/rest/v1/rpc/claim_data_archive_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ p_token_hash: await sha256Hex(rawToken) }),
  });
  if (!claim?.metadata) throw new Error("expired_or_consumed_archive_token");
  return claim.metadata as Record<string, unknown>;
}

function slug(value: string) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "all";
}

function storageObjectPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function splitCell(value: unknown): unknown[] {
  if (value === null || value === undefined) return [""];
  if (typeof value === "number" || typeof value === "boolean") return [value];
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (text.length <= MAX_CELL_CHARS) return [text];
  const parts: string[] = [];
  for (let offset = 0; offset < text.length; offset += MAX_CELL_CHARS) {
    parts.push(text.slice(offset, offset + MAX_CELL_CHARS));
  }
  return parts;
}

function expandRows(rows: Record<string, unknown>[]) {
  const baseColumns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        baseColumns.push(key);
      }
    }
  }

  const maxParts = new Map<string, number>();
  const splitRows = rows.map((row) => {
    const result: Record<string, unknown[]> = {};
    for (const column of baseColumns) {
      const parts = splitCell(row[column]);
      result[column] = parts;
      maxParts.set(column, Math.max(maxParts.get(column) ?? 1, parts.length));
    }
    return result;
  });

  const headers: string[] = [];
  for (const column of baseColumns) {
    const count = maxParts.get(column) ?? 1;
    for (let part = 1; part <= count; part += 1) {
      headers.push(part === 1 ? column : `${column}__part_${part}`);
    }
  }

  const values = splitRows.map((row) => {
    const output: unknown[] = [];
    for (const column of baseColumns) {
      const parts = row[column] ?? [""];
      const count = maxParts.get(column) ?? 1;
      for (let part = 0; part < count; part += 1) output.push(parts[part] ?? "");
    }
    return output;
  });

  return { headers, values, baseColumns };
}

function resolveOrderColumn(tableName: string, datasetCode: string | null) {
  if (datasetCode && ["capital_market_events", "bronze_historical_records"].includes(tableName)) {
    return "record_key";
  }
  return "id";
}

async function buildWorkbook(input: {
  runId: string;
  tableName: string;
  datasetCode: string | null;
  cutoffAt: string;
  partNumber: number;
  cursor: string | null;
  resource: string;
  rows: Record<string, unknown>[];
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Origination Intelligence Platform";
  workbook.created = new Date();
  workbook.modified = new Date();

  const readme = workbook.addWorksheet("LEIA-ME");
  readme.addRows([
    ["ORIGINATION INTELLIGENCE PLATFORM — ARQUIVO HISTÓRICO"],
    ["Finalidade", "Camada histórica consultável. O Supabase permanece como base operacional."],
    ["Run ID", input.runId],
    ["Tabela lógica", input.tableName],
    ["População exportada", input.resource],
    ["Dataset", input.datasetCode ?? "*"],
    ["Corte", input.cutoffAt],
    ["Parte", input.partNumber],
    ["Cursor inicial", input.cursor ?? "<início>"],
    ["Linhas", input.rows.length],
    ["Regra", "Prune somente após SHA-256, manifesto e contagem da origem coincidirem."],
  ]);
  readme.mergeCells("A1:B1");
  readme.getRow(1).font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  readme.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
  readme.getColumn(1).width = 26;
  readme.getColumn(2).width = 95;

  const expanded = expandRows(input.rows);
  const data = workbook.addWorksheet("DADOS", { views: [{ state: "frozen", ySplit: 1 }] });
  data.addRow(expanded.headers);
  for (const row of expanded.values) data.addRow(row as any[]);
  data.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, data.rowCount), column: Math.max(1, expanded.headers.length) },
  };
  const header = data.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  for (let index = 1; index <= expanded.headers.length; index += 1) {
    data.getColumn(index).width = Math.min(55, Math.max(12, expanded.headers[index - 1].length + 2));
  }

  const manifest = workbook.addWorksheet("MANIFESTO");
  manifest.addRows([
    ["campo", "valor"],
    ["run_id", input.runId],
    ["table_name", input.tableName],
    ["resource", input.resource],
    ["dataset_code", input.datasetCode ?? "*"],
    ["cutoff_at", input.cutoffAt],
    ["part_number", input.partNumber],
    ["cursor", input.cursor ?? ""],
    ["row_count", input.rows.length],
    ["base_columns", JSON.stringify(expanded.baseColumns)],
    ["exported_at", new Date().toISOString()],
    ["runtime", RUNTIME],
    ["storage_provider", ARCHIVE_STORAGE_PROVIDER],
  ]);
  manifest.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  manifest.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
  manifest.getColumn(1).width = 24;
  manifest.getColumn(2).width = 100;

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  const dates = input.rows
    .map((row) => row[TABLE_CONFIG[input.tableName].dateColumn])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();

  return {
    bytes,
    columns: expanded.headers,
    minRecordAt: dates[0] ?? null,
    maxRecordAt: dates[dates.length - 1] ?? null,
  };
}

async function patchRun(runId: string, patch: Record<string, unknown>) {
  await supabaseFetch(`/rest/v1/data_archive_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

async function googleAccessToken() {
  if (googleTokenCache && googleTokenCache.expiresAt > Date.now() + 60_000) {
    return googleTokenCache.accessToken;
  }
  if (!GOOGLE_DRIVE_CLIENT_ID || !GOOGLE_DRIVE_CLIENT_SECRET || !GOOGLE_DRIVE_REFRESH_TOKEN) {
    throw new Error("google_drive_oauth_credentials_missing");
  }

  const body = new URLSearchParams({
    client_id: GOOGLE_DRIVE_CLIENT_ID,
    client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
    refresh_token: GOOGLE_DRIVE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || !payload.access_token) {
    throw new Error(`google_oauth_${response.status}:${JSON.stringify(payload).slice(0, 500)}`);
  }

  const accessToken = String(payload.access_token);
  const expiresIn = Number(payload.expires_in ?? 3600);
  googleTokenCache = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  return accessToken;
}

async function googleJson(path: string, init: RequestInit = {}) {
  const accessToken = await googleAccessToken();
  const response = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`google_api_${response.status}:${text.replace(/\s+/g, " ").slice(0, 800)}`);
  }
  if (!text) return null;
  return JSON.parse(text);
}

async function ensureGoogleRunFolder(input: {
  runId: string;
  tableName: string;
  datasetCode: string | null;
  cutoffAt: string;
}) {
  if (!GOOGLE_DRIVE_ARCHIVE_FOLDER_ID) throw new Error("google_drive_archive_folder_missing");
  const folderName = `${slug(input.tableName)}__${slug(input.datasetCode ?? "all")}__${input.cutoffAt.slice(0, 10)}__${input.runId}`;
  const q = [
    `'${GOOGLE_DRIVE_ARCHIVE_FOLDER_ID.replaceAll("'", "\\'")}' in parents`,
    `name='${folderName.replaceAll("'", "\\'")}'`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
  ].join(" and ");
  const found = await googleJson(`/drive/v3/files?spaces=drive&q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=10`) as {
    files?: Array<{ id: string; name: string; webViewLink?: string }>;
  };
  if (found.files?.[0]?.id) return found.files[0].id;

  const created = await googleJson("/drive/v3/files?fields=id,name,webViewLink,parents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [GOOGLE_DRIVE_ARCHIVE_FOLDER_ID],
      appProperties: {
        archiveRunId: input.runId,
        archiveTable: input.tableName,
        archiveDataset: input.datasetCode ?? "*",
      },
    }),
  }) as { id: string };
  return created.id;
}

function concatBytes(...chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function uploadGoogleDriveFile(input: {
  bytes: Uint8Array;
  fileName: string;
  folderId: string;
  runId: string;
  tableName: string;
  datasetCode: string | null;
  partNumber: number;
  sha256: string;
}) {
  const accessToken = await googleAccessToken();
  const boundary = `origination_archive_${crypto.randomUUID()}`;
  const metadata = {
    name: input.fileName,
    parents: [input.folderId],
    appProperties: {
      archiveRunId: input.runId,
      archiveTable: input.tableName,
      archiveDataset: input.datasetCode ?? "*",
      archivePartNumber: String(input.partNumber),
      archiveSha256: input.sha256,
    },
  };
  const prefix = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
  );
  const suffix = encoder.encode(`\r\n--${boundary}--`);
  const body = concatBytes(prefix, input.bytes, suffix);
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink,parents",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`google_drive_upload_${response.status}:${text.replace(/\s+/g, " ").slice(0, 800)}`);
  }
  return JSON.parse(text) as {
    id: string;
    name: string;
    size?: string;
    webViewLink?: string;
    parents?: string[];
  };
}

async function appendGoogleCatalogRow(values: unknown[]) {
  if (!GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID) return null;
  try {
    await googleJson(
      `/sheets/v4/spreadsheets/${encodeURIComponent(GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID)}/values/${encodeURIComponent("MANIFESTO!A:Q")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: [values] }),
      },
    );
    return null;
  } catch (error) {
    return errorMessage(error).slice(0, 500);
  }
}

async function storeArchivePart(input: {
  bytes: Uint8Array;
  runId: string;
  tableName: string;
  datasetCode: string | null;
  cutoffAt: string;
  partNumber: number;
  workbookName: string;
  logicalStoragePath: string;
  sha256: string;
  rowCount: number;
  minRecordAt: string | null;
  maxRecordAt: string | null;
}): Promise<StoredArchivePart> {
  if (ARCHIVE_STORAGE_PROVIDER === "google_drive") {
    const folderId = await ensureGoogleRunFolder(input);
    const file = await uploadGoogleDriveFile({
      bytes: input.bytes,
      fileName: input.workbookName,
      folderId,
      runId: input.runId,
      tableName: input.tableName,
      datasetCode: input.datasetCode,
      partNumber: input.partNumber,
      sha256: input.sha256,
    });
    const externalUrl = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
    const catalogWarning = await appendGoogleCatalogRow([
      input.runId,
      input.tableName,
      input.datasetCode ?? "*",
      input.cutoffAt,
      input.partNumber,
      file.id,
      input.workbookName,
      externalUrl,
      input.rowCount,
      input.minRecordAt ?? "",
      input.maxRecordAt ?? "",
      input.bytes.length,
      input.sha256,
      "uploaded",
      new Date().toISOString(),
      "google_drive",
      folderId,
    ]);

    return {
      provider: "google_drive",
      storageBucket: "google-drive",
      storagePath: `${folderId}/${file.id}`,
      externalFileId: file.id,
      externalFolderId: folderId,
      externalUrl,
      metadata: {
        google_file_name: file.name,
        google_reported_size: file.size ?? null,
        catalog_sync_warning: catalogWarning,
      },
    };
  }

  const upload = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${ARCHIVE_BUCKET}/${storageObjectPath(input.logicalStoragePath)}`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-upsert": "true",
      },
      body: input.bytes,
    },
  );
  if (!upload.ok) {
    throw new Error(`storage_upload_http_${upload.status}:${(await upload.text()).slice(0, 500)}`);
  }

  return {
    provider: "supabase_storage",
    storageBucket: ARCHIVE_BUCKET,
    storagePath: input.logicalStoragePath,
    externalFileId: null,
    externalFolderId: null,
    externalUrl: null,
    metadata: {},
  };
}

async function finalizeRun(runId: string, resource: string) {
  const parts = await supabaseFetch(
    `/rest/v1/data_archive_parts?run_id=eq.${encodeURIComponent(runId)}&select=part_number,row_count,storage_provider,storage_path,external_file_id,external_url,sha256,size_bytes&order=part_number.asc`,
  ) as Array<Record<string, unknown>>;
  const rows = parts.reduce((sum, part) => sum + Number(part.row_count ?? 0), 0);
  await patchRun(runId, {
    status: "completed",
    completed_at: new Date().toISOString(),
    row_count: rows,
    part_count: parts.length,
    storage_provider: ARCHIVE_STORAGE_PROVIDER,
    storage_bucket: ARCHIVE_STORAGE_PROVIDER === "google_drive" ? "google-drive" : ARCHIVE_BUCKET,
    export_metadata: {
      runtime: RUNTIME,
      pagination: "cursor",
      eligibility_version: 2,
      resource,
      rows_per_invocation: MAX_ROWS_PER_INVOCATION,
      storage_provider: ARCHIVE_STORAGE_PROVIDER,
      parts,
    },
  });
  return { rows, parts: parts.length, storageProvider: ARCHIVE_STORAGE_PROVIDER };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse(405, { status: "error", error: "method_not_allowed" });

  let runId = "";
  let stage = "authenticate";
  try {
    const token = await claimToken(req.headers.get("x-archive-token")?.trim() ?? "");
    const body = await req.json().catch(() => ({})) as { runId?: string };
    runId = String(body.runId ?? token.run_id ?? "");
    if (!runId || runId !== String(token.run_id ?? "")) throw new Error("archive_run_token_mismatch");

    const runRows = await supabaseFetch(
      `/rest/v1/data_archive_runs?id=eq.${encodeURIComponent(runId)}&select=*`,
    ) as Array<Record<string, unknown>>;
    const run = runRows?.[0];
    if (!run) throw new Error("archive_run_not_found");
    if (!["queued", "running"].includes(String(run.status))) {
      throw new Error(`archive_run_invalid_status_${run.status}`);
    }

    const tableName = String(run.table_name);
    const config = TABLE_CONFIG[tableName];
    if (!config) throw new Error("archive_table_not_allowed");

    const datasetCode = run.dataset_code ? String(run.dataset_code) : null;
    const cutoffAt = String(run.cutoff_at);
    const includeRawPayload = Boolean(run.include_raw_payload);
    const cursor = token.cursor ? String(token.cursor) : null;
    const partNumber = Number(token.part_number ?? 1);
    const limit = Math.min(
      MAX_ROWS_PER_INVOCATION,
      Number(token.chunk_rows ?? run.chunk_rows ?? MAX_ROWS_PER_INVOCATION),
    );
    const orderColumn = resolveOrderColumn(tableName, datasetCode);

    if (run.status === "queued") {
      stage = "mark_running";
      await patchRun(runId, {
        status: "running",
        started_at: new Date().toISOString(),
        error_message: null,
        storage_provider: ARCHIVE_STORAGE_PROVIDER,
        storage_bucket: ARCHIVE_STORAGE_PROVIDER === "google_drive" ? "google-drive" : ARCHIVE_BUCKET,
      });
    }

    stage = `fetch_part_${partNumber}`;
    const params = new URLSearchParams();
    params.set("select", "*");
    params.set(config.dateColumn, `lte.${cutoffAt}`);
    if (datasetCode && config.datasetColumn) params.set(config.datasetColumn, `eq.${datasetCode}`);
    if (cursor) params.set(orderColumn, `gt.${cursor}`);
    params.set("order", `${orderColumn}.asc`);
    params.set("limit", String(limit));

    const rows = await supabaseFetch(
      `/rest/v1/${config.resource}?${params.toString()}`,
    ) as Record<string, unknown>[];

    if (!rows.length) {
      return jsonResponse(200, {
        status: "completed",
        runId,
        ...(await finalizeRun(runId, config.resource)),
      });
    }

    if (!includeRawPayload) {
      for (const row of rows) {
        for (const key of [
          "raw_payload",
          "normalized_payload",
          "payload",
          "output_payload",
          "raw_text",
          "evidence_payload",
        ]) {
          if (key in row) delete row[key];
        }
      }
    }

    stage = `build_part_${partNumber}`;
    const workbook = await buildWorkbook({
      runId,
      tableName,
      datasetCode,
      cutoffAt,
      partNumber,
      cursor,
      resource: config.resource,
      rows,
    });
    const sha256 = await sha256Hex(workbook.bytes);
    const datasetFolder = datasetCode ? `dataset=${slug(datasetCode)}` : "dataset=all";
    const workbookName = `${slug(tableName)}_${datasetCode ? `${slug(datasetCode)}_` : ""}${cutoffAt.slice(0, 10)}_part_${String(partNumber).padStart(3, "0")}.xlsx`;
    const logicalStoragePath = `table=${slug(tableName)}/${datasetFolder}/cutoff=${cutoffAt.slice(0, 10)}/run=${runId}/${workbookName}`;

    stage = `upload_part_${partNumber}`;
    const stored = await storeArchivePart({
      bytes: workbook.bytes,
      runId,
      tableName,
      datasetCode,
      cutoffAt,
      partNumber,
      workbookName,
      logicalStoragePath,
      sha256,
      rowCount: rows.length,
      minRecordAt: workbook.minRecordAt,
      maxRecordAt: workbook.maxRecordAt,
    });

    stage = `register_part_${partNumber}`;
    await supabaseFetch("/rest/v1/data_archive_parts?on_conflict=run_id,part_number", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        run_id: runId,
        part_number: partNumber,
        workbook_name: workbookName,
        storage_provider: stored.provider,
        storage_bucket: stored.storageBucket,
        storage_path: stored.storagePath,
        external_file_id: stored.externalFileId,
        external_folder_id: stored.externalFolderId,
        external_url: stored.externalUrl,
        migrated_at: stored.provider === "google_drive" ? new Date().toISOString() : null,
        row_count: rows.length,
        min_record_at: workbook.minRecordAt,
        max_record_at: workbook.maxRecordAt,
        sha256,
        size_bytes: workbook.bytes.length,
        columns: workbook.columns,
        metadata: {
          runtime: RUNTIME,
          eligibility_version: 2,
          resource: config.resource,
          include_raw_payload: includeRawPayload,
          cursor,
          order_column: orderColumn,
          storage_provider: stored.provider,
          ...stored.metadata,
        },
      }),
    });

    const nextCursor = String(rows[rows.length - 1]?.[orderColumn] ?? "");
    if (!nextCursor) throw new Error("archive_next_cursor_missing");
    if (rows.length < limit) {
      return jsonResponse(200, {
        status: "completed",
        runId,
        ...(await finalizeRun(runId, config.resource)),
      });
    }

    stage = "queue_cursor_continuation";
    const continuation = await supabaseFetch(
      "/rest/v1/rpc/continue_historical_excel_export_cursor",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          p_run_id: runId,
          p_cursor: nextCursor,
          p_part_number: partNumber + 1,
        }),
      },
    );

    return jsonResponse(202, {
      status: "continued",
      runId,
      partNumber,
      rows: rows.length,
      nextCursor,
      storageProvider: stored.provider,
      continuation,
    });
  } catch (error) {
    const detail = `${stage}:${errorMessage(error)}`.slice(0, 900);
    if (runId) {
      try {
        await patchRun(runId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: detail,
        });
      } catch {
        // best-effort audit
      }
    }
    console.error(`[${RUNTIME}] ${detail}`);
    return jsonResponse(500, {
      status: "failed",
      runId: runId || null,
      stage,
      error: errorMessage(error),
    });
  }
});
