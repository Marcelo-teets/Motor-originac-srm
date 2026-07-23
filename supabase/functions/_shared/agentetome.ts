import { unzipSync } from "npm:fflate@0.8.2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const AGENTETOME_BUCKET = "agentetome-raw";
export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export const jsonResponse = (status: number, body: unknown, runtime: string) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-origination-runtime": runtime,
  },
});

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function supabaseFetch(path: string, init: RequestInit = {}): Promise<any> {
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
  try { return JSON.parse(text); } catch { return text; }
}

export async function claimOneTimeToken(token: string): Promise<Record<string, any>> {
  if (!token || token.length < 32) throw new Error("invalid_ingestion_token");
  const claim = await supabaseFetch("/rest/v1/rpc/claim_agentetome_ingestion_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ p_token_hash: await sha256Hex(token) }),
  });
  if (!claim?.metadata) throw new Error("expired_or_consumed_ingestion_token");
  return claim.metadata;
}

export async function insertRow(table: string, row: Record<string, unknown>): Promise<any[]> {
  const result = await supabaseFetch(`/rest/v1/${table}`, {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(result) ? result : [];
}

export async function patchRow(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
  await supabaseFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

export async function upsertRows(table: string, rows: Record<string, unknown>[], conflict: string): Promise<any[]> {
  if (!rows.length) return [];
  const result = await supabaseFetch(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });
  return Array.isArray(result) ? result : [];
}

type ParsedCsv = { headers: string[]; rows: Record<string, string>[] };

function parseCsv(text: string): ParsedCsv {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.length > 0)) matrix.push(row);
      row = [];
    } else field += char;
  }

  row.push(field);
  if (row.some((value) => value.length > 0)) matrix.push(row);
  if (!matrix.length) return { headers: [], rows: [] };

  const headers = matrix.shift()!.map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "").trim() : value.trim());
  return {
    headers,
    rows: matrix.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))),
  };
}

function normalizeCnpj(row: Record<string, string>): string | null {
  for (const key of ["cnpj", "cnpj_fundo", "cnpj_fundo_classe", "cnpj_emissor", "cnpj_administrador"]) {
    const digits = String(row[key] ?? "").replace(/\D/g, "");
    if (digits.length === 14) return digits;
  }
  return null;
}

function resolveRefDate(row: Record<string, string>): string | null {
  for (const key of ["data_posicao", "data_referencia", "data_competencia", "dt_comptc"]) {
    const value = String(row[key] ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }
  const competence = String(row.competencia ?? "").trim();
  return /^\d{4}-\d{2}$/.test(competence) ? `${competence}-01` : null;
}

export function storageObjectPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function slug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

export type ParsedArchive = {
  packageHash: string;
  rowCounts: Record<string, number>;
  headers: Record<string, string[]>;
  bronzeRows: Record<string, unknown>[];
  fileCount: number;
};

export async function parseAgentetomeArchive(input: {
  zipBytes: Uint8Array;
  expectedHash?: string;
  expectedSize?: number;
  expectedRows: Record<string, { linhas?: number } | number>;
  storageUrl: string;
  schemaVersion: number;
}): Promise<ParsedArchive> {
  const { zipBytes, expectedHash, expectedSize, expectedRows, storageUrl, schemaVersion } = input;
  if (!zipBytes.length || zipBytes.length > MAX_ZIP_BYTES) throw new Error("agentetome_zip_size_invalid");
  if (expectedSize && zipBytes.length !== expectedSize) throw new Error("agentetome_zip_size_mismatch");

  const packageHash = await sha256Hex(zipBytes);
  if (expectedHash && packageHash !== expectedHash) throw new Error("agentetome_zip_hash_mismatch");

  const archive = unzipSync(zipBytes);
  const csvFiles = Object.entries(archive).filter(([name]) => name.toLowerCase().endsWith(".csv"));
  if (!csvFiles.length) throw new Error("agentetome_zip_without_csv");

  const rowCounts: Record<string, number> = {};
  const headers: Record<string, string[]> = {};
  const bronzeRows: Record<string, unknown>[] = [];

  for (const [fileName, fileBytes] of csvFiles) {
    const parsed = parseCsv(decoder.decode(fileBytes));
    rowCounts[fileName] = parsed.rows.length;
    headers[fileName] = parsed.headers;
    const rawExpected = expectedRows[fileName];
    const expected = typeof rawExpected === "number" ? rawExpected : Number(rawExpected?.linhas ?? -1);
    if (expected >= 0 && expected !== parsed.rows.length) throw new Error(`row_count_mismatch_${fileName}`);

    const datasetCode = `agentetome_${fileName.replace(/\.csv$/i, "").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase()}_v${schemaVersion}`;
    for (const [rowIndex, row] of parsed.rows.entries()) {
      const contentHash = await sha256Hex(JSON.stringify(row));
      bronzeRows.push({
        dataset_code: datasetCode,
        record_key: `${fileName}:line=${rowIndex + 1}`,
        ref_date: resolveRefDate(row),
        entity_cnpj: normalizeCnpj(row),
        payload: {
          ...row,
          _lineage: {
            provider: "agentetome",
            package_hash: packageHash,
            file_name: fileName,
            row_number: rowIndex + 1,
            schema_version: schemaVersion,
          },
        },
        source_url: `${storageUrl}#${fileName}`,
        content_hash: contentHash,
      });
    }
  }

  for (const fileName of Object.keys(expectedRows)) {
    if (!(fileName in rowCounts)) throw new Error(`missing_expected_file_${fileName}`);
  }

  return { packageHash, rowCounts, headers, bronzeRows, fileCount: csvFiles.length };
}

export async function writeBronze(rows: Record<string, unknown>[]): Promise<void> {
  for (let index = 0; index < rows.length; index += 200) {
    await upsertRows("bronze_historical_records", rows.slice(index, index + 200), "dataset_code,record_key");
  }
}
