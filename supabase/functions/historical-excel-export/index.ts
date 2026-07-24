import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import ExcelJS from "npm:exceljs@4.4.0";

const RUNTIME = "historical-excel-export-v4";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ARCHIVE_BUCKET = "historical-excel-archive";
const MAX_CELL_CHARS = 32_000;
const MAX_ROWS_PER_INVOCATION = 1_000;
const encoder = new TextEncoder();

const TABLE_CONFIG: Record<string, { dateColumn: string; datasetColumn?: string }> = {
  capital_market_events: { dateColumn: "observed_at", datasetColumn: "dataset_code" },
  bronze_historical_records: { dateColumn: "ingested_at", datasetColumn: "dataset_code" },
  source_documents: { dateColumn: "observed_at" },
  monitoring_outputs: { dateColumn: "observed_at" },
  company_signals: { dateColumn: "observed_at" },
  company_factor_observations: { dateColumn: "observed_at" },
  score_snapshots: { dateColumn: "created_at" },
  qualification_snapshots: { dateColumn: "created_at" },
  lead_score_snapshots: { dateColumn: "created_at" },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-origination-runtime": RUNTIME,
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function supabaseFetch(path: string, init: RequestInit = {}): Promise<any> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("supabase_runtime_credentials_missing");
  }

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

async function claimToken(rawToken: string): Promise<Record<string, any>> {
  if (!rawToken || rawToken.length < 32) throw new Error("invalid_archive_token");
  const claim = await supabaseFetch("/rest/v1/rpc/claim_data_archive_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ p_token_hash: await sha256Hex(rawToken) }),
  });
  if (!claim?.metadata) throw new Error("expired_or_consumed_archive_token");
  return claim.metadata;
}

function slug(value: string): string {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "all";
}

function storageObjectPath(path: string): string {
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

function expandRows(rows: Record<string, unknown>[]): {
  headers: string[];
  values: unknown[][];
  baseColumns: string[];
} {
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
    const partCount = maxParts.get(column) ?? 1;
    for (let part = 1; part <= partCount; part += 1) {
      headers.push(part === 1 ? column : `${column}__part_${part}`);
    }
  }

  const values = splitRows.map((row) => {
    const output: unknown[] = [];
    for (const column of baseColumns) {
      const parts = row[column] ?? [""];
      const partCount = maxParts.get(column) ?? 1;
      for (let part = 0; part < partCount; part += 1) {
        output.push(parts[part] ?? "");
      }
    }
    return output;
  });

  return { headers, values, baseColumns };
}

function resolveOrderColumn(tableName: string, datasetCode: string | null): string {
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
  rows: Record<string, unknown>[];
}): Promise<{
  bytes: Uint8Array;
  columns: string[];
  minRecordAt: string | null;
  maxRecordAt: string | null;
}> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Origination Intelligence Platform";
  workbook.created = new Date();

  const readme = workbook.addWorksheet("LEIA-ME");
  readme.addRows([
    ["ORIGINATION INTELLIGENCE PLATFORM — ARQUIVO HISTÓRICO"],
    ["Finalidade", "Camada secundária consultável em Excel. O Supabase continua sendo a base operacional."],
    ["Run ID", input.runId],
    ["Tabela", input.tableName],
    ["Dataset", input.datasetCode ?? "*"],
    ["Corte", input.cutoffAt],
    ["Parte", input.partNumber],
    ["Cursor inicial", input.cursor ?? "<início>"],
    ["Linhas", input.rows.length],
    ["Regra", "Nenhuma limpeza no Supabase deve ocorrer antes de status verified e checksum SHA-256 válido."],
  ]);
  readme.getColumn(1).width = 24;
  readme.getColumn(2).width = 95;
  readme.getRow(1).font = { bold: true, size: 16 };
  readme.mergeCells("A1:B1");

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
    ["dataset_code", input.datasetCode ?? "*"],
    ["cutoff_at", input.cutoffAt],
    ["part_number", input.partNumber],
    ["cursor", input.cursor ?? ""],
    ["row_count", input.rows.length],
    ["base_columns", JSON.stringify(expanded.baseColumns)],
    ["exported_at", new Date().toISOString()],
    ["runtime", RUNTIME],
  ]);
  manifest.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  manifest.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
  manifest.getColumn(1).width = 24;
  manifest.getColumn(2).width = 100;

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  const dateColumn = TABLE_CONFIG[input.tableName].dateColumn;
  const dates = input.rows
    .map((row) => row[dateColumn])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();

  return {
    bytes,
    columns: expanded.headers,
    minRecordAt: dates[0] ?? null,
    maxRecordAt: dates[dates.length - 1] ?? null,
  };
}

async function patchRun(runId: string, patch: Record<string, unknown>): Promise<void> {
  await supabaseFetch(`/rest/v1/data_archive_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

async function finalizeRun(runId: string): Promise<{ rows: number; parts: number }> {
  const parts = await supabaseFetch(
    `/rest/v1/data_archive_parts?run_id=eq.${encodeURIComponent(runId)}&select=part_number,row_count,storage_path,sha256,size_bytes&order=part_number.asc`,
  ) as Array<Record<string, any>>;
  const rows = parts.reduce((sum, part) => sum + Number(part.row_count ?? 0), 0);
  await patchRun(runId, {
    status: "completed",
    completed_at: new Date().toISOString(),
    row_count: rows,
    part_count: parts.length,
    export_metadata: {
      runtime: RUNTIME,
      pagination: "cursor",
      rows_per_invocation: MAX_ROWS_PER_INVOCATION,
      parts,
    },
  });
  return { rows, parts: parts.length };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { status: "error", error: "method_not_allowed" });
  }

  let runId = "";
  let stage = "authenticate";
  try {
    const token = await claimToken(req.headers.get("x-archive-token")?.trim() ?? "");
    const body = await req.json().catch(() => ({})) as { runId?: string };
    runId = String(body.runId ?? token.run_id ?? "");
    if (!runId || runId !== String(token.run_id ?? "")) {
      throw new Error("archive_run_token_mismatch");
    }

    const runRows = await supabaseFetch(
      `/rest/v1/data_archive_runs?id=eq.${encodeURIComponent(runId)}&select=*`,
    ) as Array<Record<string, any>>;
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
      });
    }

    stage = `fetch_part_${partNumber}`;
    const params = new URLSearchParams();
    params.set("select", "*");
    params.set(config.dateColumn, `lte.${cutoffAt}`);
    if (datasetCode && config.datasetColumn) {
      params.set(config.datasetColumn, `eq.${datasetCode}`);
    }
    if (cursor) params.set(orderColumn, `gt.${cursor}`);
    params.set("order", `${orderColumn}.asc`);
    params.set("limit", String(limit));
    const rows = await supabaseFetch(`/rest/v1/${tableName}?${params.toString()}`) as Record<string, unknown>[];

    if (!rows.length) {
      const finalized = await finalizeRun(runId);
      return jsonResponse(200, { status: "completed", runId, ...finalized });
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
      rows,
    });
    const sha256 = await sha256Hex(workbook.bytes);
    const datasetFolder = datasetCode ? `dataset=${slug(datasetCode)}` : "dataset=all";
    const workbookName = `${slug(tableName)}_${datasetCode ? `${slug(datasetCode)}_` : ""}${cutoffAt.slice(0, 10)}_part_${String(partNumber).padStart(3, "0")}.xlsx`;
    const storagePath = `table=${slug(tableName)}/${datasetFolder}/cutoff=${cutoffAt.slice(0, 10)}/run=${runId}/${workbookName}`;

    stage = `upload_part_${partNumber}`;
    const upload = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${ARCHIVE_BUCKET}/${storageObjectPath(storagePath)}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "x-upsert": "true",
        },
        body: workbook.bytes,
      },
    );
    if (!upload.ok) {
      throw new Error(`storage_upload_http_${upload.status}:${(await upload.text()).slice(0, 500)}`);
    }

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
        storage_bucket: ARCHIVE_BUCKET,
        storage_path: storagePath,
        row_count: rows.length,
        min_record_at: workbook.minRecordAt,
        max_record_at: workbook.maxRecordAt,
        sha256,
        size_bytes: workbook.bytes.length,
        columns: workbook.columns,
        metadata: {
          runtime: RUNTIME,
          include_raw_payload: includeRawPayload,
          cursor,
          order_column: orderColumn,
        },
      }),
    });

    const nextCursor = String(rows[rows.length - 1]?.[orderColumn] ?? "");
    if (!nextCursor) throw new Error("archive_next_cursor_missing");
    if (rows.length < limit) {
      const finalized = await finalizeRun(runId);
      return jsonResponse(200, { status: "completed", runId, ...finalized });
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
        // best effort audit
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
