import { createHash, randomUUID } from 'node:crypto';
import { getDataClient } from '../lib/dataClient.js';
import { extractZipArchiveEntry, listZipArchiveEntries } from '../lib/zipArchive.js';

/**
 * Agentetome export pipeline running on Vercel + Neon.
 *
 * Replaces the legacy database-side HTTP calls (pgsql-http/pg_net), the vault
 * secret and the Edge Function that downloaded, validated and persisted the
 * administrator export package. The provider contract is unchanged:
 *   - GET  /api/v1/export/admin/manifest       (manifest probe)
 *   - POST /api/mcp tools/call "exportar_admin" (signed download link)
 *   - GET  /api/export/download?t=...           (ZIP with one CSV per dataset)
 * The signed link and the raw ZIP are never persisted; the package hash, row
 * counts, headers and every CSV row (bronze_historical_records) are.
 */

export const AGENTETOME_ORIGIN = 'https://www.agentetome.com';
export const PIPELINE_RUNTIME = 'vercel-agentetome-pipeline-v1';
export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const BRONZE_CHUNK = 200;
const NOT_PERSISTED_BUCKET = 'not_persisted';

export type DataClient = NonNullable<ReturnType<typeof getDataClient>>;
export type TriggerType = 'manual' | 'scheduled' | 'retry';
export type ExportRequest = {
  admin: string;
  cut: string;
  competence: string | null;
  format: string;
};

export type PipelineDeps = {
  client: DataClient;
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export class AgentetomeError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message);
    this.name = 'AgentetomeError';
  }
}

const sha256Hex = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const slug = (value: string) => value
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';

export const validateExportRequest = (input: Partial<ExportRequest>): ExportRequest => {
  const admin = String(input.admin ?? '').trim();
  const cut = String(input.cut ?? 'recente');
  const format = String(input.format ?? 'csv');
  const competence = input.competence ? String(input.competence) : null;
  if (!admin) throw new AgentetomeError('admin_required', 400);
  if (!['recente', 'competencia'].includes(cut)) throw new AgentetomeError('invalid_cut', 400);
  if (!['csv', 'xlsx'].includes(format)) throw new AgentetomeError('invalid_format', 400);
  if (cut === 'competencia' && !/^\d{4}-\d{2}$/.test(competence ?? '')) throw new AgentetomeError('invalid_competence', 400);
  return { admin, cut, competence, format };
};

// --- CSV / ZIP --------------------------------------------------------------

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[] };

/** RFC 4180 CSV (comma separated, double-quote escaping, CRLF or LF). */
export const parseCsv = (text: string): ParsedCsv => {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0)) matrix.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value.length > 0)) matrix.push(row);
  if (!matrix.length) return { headers: [], rows: [] };
  const headers = matrix.shift()!.map((value, index) => (index === 0 ? value.replace(/^﻿/, '').trim() : value.trim()));
  return {
    headers,
    rows: matrix.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))),
  };
};

const normalizeCnpj = (row: Record<string, string>) => {
  for (const key of ['cnpj', 'cnpj_fundo', 'cnpj_fundo_classe', 'cnpj_emissor', 'cnpj_administrador']) {
    const digits = String(row[key] ?? '').replace(/\D/g, '');
    if (digits.length === 14) return digits;
  }
  return null;
};

const resolveRefDate = (row: Record<string, string>) => {
  for (const key of ['data_posicao', 'data_referencia', 'data_competencia', 'dt_comptc']) {
    const value = String(row[key] ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }
  const competence = String(row.competencia ?? '').trim();
  return /^\d{4}-\d{2}$/.test(competence) ? `${competence}-01` : null;
};

export type BronzeRow = {
  dataset_code: string;
  record_key: string;
  ref_date: string | null;
  entity_cnpj: string | null;
  payload: Record<string, unknown>;
  source_url: string;
  content_hash: string;
};

export type ParsedArchive = {
  packageHash: string;
  rowCounts: Record<string, number>;
  headers: Record<string, string[]>;
  bronzeRows: BronzeRow[];
  fileCount: number;
};

/**
 * Same validation and bronze lineage as the legacy Edge Function, so packages
 * ingested before and after the migration share dataset codes, record keys and
 * content hashes (idempotent upserts on dataset_code,record_key).
 */
export const parseAgentetomeArchive = (input: {
  zipBytes: Buffer;
  expectedSize?: number;
  expectedRows: Record<string, { linhas?: number } | number>;
  sourceUrl: string;
  schemaVersion: number;
}): ParsedArchive => {
  const { zipBytes, expectedSize, expectedRows, sourceUrl, schemaVersion } = input;
  if (!zipBytes.length || zipBytes.length > MAX_ZIP_BYTES) throw new AgentetomeError('agentetome_zip_size_invalid');
  if (expectedSize && zipBytes.length !== expectedSize) throw new AgentetomeError('agentetome_zip_size_mismatch');

  const packageHash = sha256Hex(zipBytes);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const csvEntries = listZipArchiveEntries(zipBytes, { maxEntries: 200 })
    .filter((entry) => entry.name.toLowerCase().endsWith('.csv'));
  if (!csvEntries.length) throw new AgentetomeError('agentetome_zip_without_csv');

  const rowCounts: Record<string, number> = {};
  const headers: Record<string, string[]> = {};
  const bronzeRows: BronzeRow[] = [];
  for (const entry of csvEntries) {
    const fileName = entry.name;
    const parsed = parseCsv(decoder.decode(extractZipArchiveEntry(zipBytes, entry)));
    rowCounts[fileName] = parsed.rows.length;
    headers[fileName] = parsed.headers;
    const rawExpected = expectedRows[fileName];
    const expected = typeof rawExpected === 'number' ? rawExpected : Number(rawExpected?.linhas ?? -1);
    if (expected >= 0 && expected !== parsed.rows.length) throw new AgentetomeError(`row_count_mismatch_${fileName}`);

    const datasetCode = `agentetome_${fileName.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}_v${schemaVersion}`;
    parsed.rows.forEach((row, rowIndex) => {
      bronzeRows.push({
        dataset_code: datasetCode,
        record_key: `${fileName}:line=${rowIndex + 1}`,
        ref_date: resolveRefDate(row),
        entity_cnpj: normalizeCnpj(row),
        payload: {
          ...row,
          _lineage: {
            provider: 'agentetome',
            package_hash: packageHash,
            file_name: fileName,
            row_number: rowIndex + 1,
            schema_version: schemaVersion,
          },
        },
        source_url: `${sourceUrl}#${fileName}`,
        content_hash: sha256Hex(JSON.stringify(row)),
      });
    });
  }
  for (const fileName of Object.keys(expectedRows)) {
    if (!(fileName in rowCounts)) throw new AgentetomeError(`missing_expected_file_${fileName}`);
  }
  return { packageHash, rowCounts, headers, bronzeRows, fileCount: csvEntries.length };
};

// --- Provider calls -----------------------------------------------------------

const providerHeaders = (apiKey: string, extra: Record<string, string> = {}) => {
  if (!apiKey) throw new AgentetomeError('AGENTETOME_API_KEY não está configurada.', 503);
  return { authorization: `Bearer ${apiKey}`, accept: 'application/json', ...extra };
};

export const probeAdminManifest = async (request: ExportRequest, deps: Pick<PipelineDeps, 'apiKey' | 'fetchImpl'>) => {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = new URL('/api/v1/export/admin/manifest', AGENTETOME_ORIGIN);
  url.searchParams.set('admin', request.admin);
  url.searchParams.set('corte', request.cut);
  if (request.competence) url.searchParams.set('competencia', request.competence);
  const startedAt = Date.now();
  const response = await fetchImpl(url, { headers: providerHeaders(deps.apiKey) });
  const text = await response.text();
  let payload: Record<string, unknown>;
  try {
    payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    payload = { unparsed_body: text.slice(0, 2000) };
  }
  return { httpStatus: response.status, durationMs: Date.now() - startedAt, payload };
};

export type ExportPayload = {
  manifest: { schema_versao?: number; gerado_em?: string; arquivos?: Record<string, { linhas?: number } | number> };
  link_download: string;
  tamanho_bytes?: number;
  arquivo?: string;
  expira_em?: string;
};

export const requestAdminExport = async (request: ExportRequest, deps: Pick<PipelineDeps, 'apiKey' | 'fetchImpl'>) => {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(new URL('/api/mcp', AGENTETOME_ORIGIN), {
    method: 'POST',
    headers: providerHeaders(deps.apiKey, { 'content-type': 'application/json' }),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'exportar_admin',
        arguments: Object.fromEntries(Object.entries({
          admin: request.admin,
          corte: request.cut,
          competencia: request.competence,
          formato: request.format,
        }).filter(([, value]) => value !== null && value !== undefined)),
      },
    }),
  });
  const text = await response.text();
  let rpc: any;
  try {
    rpc = text ? JSON.parse(text) : {};
  } catch {
    throw new AgentetomeError('agentetome_invalid_rpc_response');
  }
  if (response.status < 200 || response.status >= 300 || rpc?.error) {
    throw Object.assign(new AgentetomeError(`agentetome_export_request_failed:http_${response.status}`), { httpStatus: response.status });
  }
  if (rpc?.result?.isError) throw new AgentetomeError('agentetome_export_tool_error');
  const toolText = (rpc?.result?.content ?? []).find((item: any) => item?.type === 'text')?.text;
  if (!toolText) throw new AgentetomeError('agentetome_empty_tool_response');
  let payload: ExportPayload;
  try {
    payload = JSON.parse(toolText) as ExportPayload;
  } catch {
    throw new AgentetomeError('agentetome_unparseable_tool_response');
  }
  if (Number(payload?.manifest?.schema_versao ?? 0) !== 1) throw new AgentetomeError('unsupported_agentetome_schema');
  return payload;
};

export const assertDownloadUrl = (value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AgentetomeError('invalid_agentetome_download_url');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'www.agentetome.com' || url.pathname !== '/api/export/download' || !url.searchParams.get('t')) {
    throw new AgentetomeError('invalid_agentetome_download_url');
  }
  return url;
};

// --- Orchestration ------------------------------------------------------------

const writeBronze = async (client: DataClient, rows: BronzeRow[]) => {
  for (let index = 0; index < rows.length; index += BRONZE_CHUNK) {
    await client.upsert('bronze_historical_records', rows.slice(index, index + BRONZE_CHUNK), 'dataset_code,record_key');
  }
};

export type ExportResult = Record<string, unknown> & { status: 'real' | 'failed' };

export const runAdminExport = async (
  input: ExportRequest & { requestedBy?: string | null; triggerType?: TriggerType },
  deps: PipelineDeps,
): Promise<ExportResult> => {
  const request = validateExportRequest(input);
  if (!deps.apiKey) throw new AgentetomeError('AGENTETOME_API_KEY não está configurada.', 503);
  const triggerType: TriggerType = input.triggerType ?? 'manual';
  const { client } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  let stage = 'record_attempt';
  let connectorRunId: string | null = null;

  try {
    const attempt = await client.rpc<Record<string, unknown>>('record_agentetome_export_attempt', {
      p_admin: request.admin,
      p_cut: request.cut,
      p_competence: request.competence,
      p_format: request.format,
      p_requested_by: input.requestedBy ?? null,
      p_trigger_type: triggerType,
      p_status: 'started',
    });
    const sourceId = typeof attempt?.sourceId === 'string' ? attempt.sourceId : null;
    if (!sourceId) throw new AgentetomeError('agentetome_source_missing', 503);

    stage = 'request_export';
    const payload = await requestAdminExport(request, deps);
    const downloadUrl = assertDownloadUrl(String(payload.link_download ?? ''));
    if (payload.expira_em && Date.parse(payload.expira_em) <= now().getTime()) throw new AgentetomeError('provider_download_link_expired');

    stage = 'download_provider_zip';
    const download = await fetchImpl(downloadUrl, { headers: { accept: 'application/zip, application/octet-stream' } });
    if (!download.ok) throw new AgentetomeError(`agentetome_download_http_${download.status}`);
    const declared = Number(download.headers.get('content-length') ?? 0);
    if (declared > MAX_ZIP_BYTES) throw new AgentetomeError('agentetome_zip_size_invalid');
    const zipBytes = Buffer.from(await download.arrayBuffer());

    stage = 'validate_archive';
    const schemaVersion = Number(payload.manifest.schema_versao);
    const packageHash = sha256Hex(zipBytes);
    const generatedAt = payload.manifest.gerado_em ? String(payload.manifest.gerado_em) : startedAt.toISOString();
    const storagePath = `administrator=${slug(request.admin)}/cut=${request.cut}/generated=${generatedAt.slice(0, 10)}/${packageHash}.zip`;
    const parsed = parseAgentetomeArchive({
      zipBytes,
      expectedSize: Number(payload.tamanho_bytes ?? 0) || undefined,
      expectedRows: payload.manifest.arquivos ?? {},
      sourceUrl: `agentetome://${NOT_PERSISTED_BUCKET}/${storagePath}`,
      schemaVersion,
    });

    const existing = await client.select('agentetome_export_packages', {
      select: 'id,status',
      filters: [{ column: 'content_hash', value: packageHash }],
      limit: 1,
    }) as Array<{ id: string; status: string }>;
    if (existing[0]?.status === 'parsed') {
      stage = 'refresh_bronze_lineage';
      await writeBronze(client, parsed.bronzeRows);
      stage = 'refresh_existing_package';
      const refresh = await client.rpc('refresh_agentetome_existing_package', {
        p_package_hash: packageHash,
        p_runtime: PIPELINE_RUNTIME,
        p_trigger_type: `agentetome_${triggerType}`,
      });
      return {
        status: 'real',
        mode: 'idempotent_existing_package',
        packageId: existing[0].id,
        packageHash,
        rows: parsed.rowCounts,
        bronzeRowsReconciled: parsed.bronzeRows.length,
        refresh,
        rawDownloadLinkPersisted: false,
      };
    }

    stage = 'create_connector_run';
    connectorRunId = randomUUID();
    await client.insert('source_connector_runs', [{
      id: connectorRunId,
      company_id: null,
      source_id: sourceId,
      scope_type: 'administrator',
      trigger_type: `agentetome_${triggerType}`,
      status: 'running',
      started_at: startedAt.toISOString(),
      items_collected: 0,
      outputs_written: 0,
      signals_written: 0,
      enrichments_written: 0,
      metadata: {
        source_code: 'src_agentetome_api',
        administrator: request.admin,
        cut: request.cut,
        competence: request.competence,
        format: request.format,
        trigger_type: triggerType,
        schema_version: schemaVersion,
        runtime: PIPELINE_RUNTIME,
      },
    }]);

    stage = 'register_package';
    const packageRows = await client.upsert('agentetome_export_packages', [{
      source_id: sourceId,
      connector_run_id: connectorRunId,
      administrator: request.admin,
      cut: request.cut,
      competence: request.competence,
      format: request.format,
      schema_version: schemaVersion,
      provider_file_name: String(payload.arquivo ?? 'agentetome-export.zip'),
      provider_generated_at: generatedAt,
      provider_expires_at: payload.expira_em ?? null,
      storage_bucket: NOT_PERSISTED_BUCKET,
      storage_path: storagePath,
      content_hash: packageHash,
      size_bytes: zipBytes.length,
      mime_type: download.headers.get('content-type') ?? 'application/zip',
      file_count: parsed.fileCount,
      row_counts: parsed.rowCounts,
      headers: parsed.headers,
      status: 'stored',
      metadata: {
        manifest: payload.manifest,
        runtime: PIPELINE_RUNTIME,
        trigger_type: triggerType,
        ingestion_mode: 'direct_export',
        raw_zip_persisted: false,
        raw_download_link_persisted: false,
      },
    }], 'content_hash') as Array<{ id?: string }>;
    const packageId = String(packageRows[0]?.id ?? existing[0]?.id ?? '');
    if (!packageId) throw new AgentetomeError('package_registration_failed');

    stage = 'write_bronze';
    await writeBronze(client, parsed.bronzeRows);

    stage = 'finalize_and_sync_silver';
    const result = await client.rpc('finalize_agentetome_direct_package_v2', {
      p_package_id: packageId,
      p_headers: parsed.headers,
      p_row_counts: parsed.rowCounts,
      p_bronze_rows: parsed.bronzeRows.length,
      p_runtime: PIPELINE_RUNTIME,
    });

    return {
      status: 'real',
      packageId,
      connectorRunId,
      schemaVersion,
      packageHash,
      sizeBytes: zipBytes.length,
      files: parsed.rowCounts,
      bronzeRowsWritten: parsed.bronzeRows.length,
      result,
      rawZipPersisted: false,
      rawDownloadLinkPersisted: false,
    };
  } catch (error) {
    const detail = `${stage}:${errorText(error)}`.slice(0, 900);
    if (connectorRunId) {
      await client.update('source_connector_runs', {
        status: 'failed',
        finished_at: now().toISOString(),
        error_message: detail,
      }, [{ column: 'id', value: connectorRunId }]).catch(() => undefined);
    }
    if (stage !== 'record_attempt') {
      await client.rpc('record_agentetome_export_attempt', {
        p_admin: request.admin,
        p_cut: request.cut,
        p_competence: request.competence,
        p_format: request.format,
        p_requested_by: input.requestedBy ?? null,
        p_trigger_type: triggerType,
        p_status: 'failed',
        p_error: detail,
        p_http_status: (error as { httpStatus?: number })?.httpStatus ?? 502,
        p_duration_ms: now().getTime() - startedAt.getTime(),
        p_summary: { stage, runtime: PIPELINE_RUNTIME },
      }).catch(() => undefined);
    }
    return { status: 'failed', stage, error: errorText(error), administrator: request.admin, triggerType };
  }
};

export const runDueExports = async (deps: PipelineDeps, limit = 1) => {
  const ranAt = (deps.now ?? (() => new Date()))().toISOString();
  if (!deps.apiKey) return { status: 'blocked', reason: 'AGENTETOME_API_KEY não está configurada.', targetsProcessed: 0, results: [], ranAt };
  const claimed = await deps.client.rpc<Array<{ administrator: string; cut: string; competence: string | null; format: string; trigger_type: TriggerType }>>(
    'claim_due_agentetome_targets',
    { p_limit: limit },
  );
  const targets = Array.isArray(claimed) ? claimed : [];
  const results: ExportResult[] = [];
  for (const target of targets) {
    results.push(await runAdminExport({
      admin: target.administrator,
      cut: target.cut,
      competence: target.competence,
      format: target.format,
      triggerType: target.trigger_type,
      requestedBy: null,
    }, deps));
  }
  return { status: 'completed', targetsProcessed: results.length, results, ranAt };
};

export const requirePipelineDeps = (): PipelineDeps => {
  const client = getDataClient();
  if (!client) throw new AgentetomeError('Neon database is not configured. Set MOTOR_NEON_DATABASE_URL or DATABASE_URL.', 503);
  return { client, apiKey: String(process.env.AGENTETOME_API_KEY ?? '') };
};
