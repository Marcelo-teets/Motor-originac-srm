import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  AGENTETOME_BUCKET,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  claimOneTimeToken,
  errorMessage,
  insertRow,
  jsonResponse,
  parseAgentetomeArchive,
  patchRow,
  sha256Hex,
  slug,
  storageObjectPath,
  supabaseFetch,
  upsertRows,
  writeBronze,
} from "../_shared/agentetome.ts";

const RUNTIME = "agentetome-ingest-export-v4";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { status: "error", error: "method_not_allowed" }, RUNTIME);

  let connectorRunId: string | null = null;
  let administrator = "";
  let triggerType = "manual";
  let stage = "authenticate";
  const startedAt = new Date().toISOString();

  try {
    const metadata = await claimOneTimeToken(req.headers.get("x-ingestion-token")?.trim() ?? "");
    const body = await req.json() as { signedUrl?: string };
    const signedUrl = new URL(String(body.signedUrl ?? ""));
    if (
      signedUrl.protocol !== "https:" ||
      signedUrl.hostname !== "www.agentetome.com" ||
      signedUrl.pathname !== "/api/export/download" ||
      !signedUrl.searchParams.get("t")
    ) throw new Error("invalid_agentetome_download_url");

    const sourceId = String(metadata.source_id ?? "");
    administrator = String(metadata.administrator ?? "");
    const cut = String(metadata.cut ?? "recente");
    const competence = metadata.competence ? String(metadata.competence) : null;
    const format = String(metadata.format ?? "csv");
    triggerType = String(metadata.trigger_type ?? "manual");
    const schemaVersion = Number(metadata.schema_version ?? 0);
    const manifest = (metadata.manifest ?? {}) as Record<string, any>;
    const expectedSize = Number(metadata.expected_size_bytes ?? 0);
    const providerFileName = String(metadata.provider_file_name ?? "agentetome-export.zip");
    const providerExpiresAt = metadata.provider_expires_at ? String(metadata.provider_expires_at) : null;
    const providerGeneratedAt = manifest.gerado_em ? String(manifest.gerado_em) : new Date().toISOString();

    if (!sourceId || !administrator || schemaVersion !== 1) throw new Error("invalid_ingestion_metadata");
    if (!['manual', 'scheduled', 'retry'].includes(triggerType)) triggerType = "manual";
    if (providerExpiresAt && Date.parse(providerExpiresAt) <= Date.now()) throw new Error("provider_download_link_expired");

    stage = "download_provider_zip";
    const download = await fetch(signedUrl, { headers: { accept: "application/zip, application/octet-stream" } });
    if (!download.ok) throw new Error(`agentetome_download_http_${download.status}`);
    const zipBytes = new Uint8Array(await download.arrayBuffer());
    const packageHash = await sha256Hex(zipBytes);

    const existing = await supabaseFetch(
      `/rest/v1/agentetome_export_packages?content_hash=eq.${packageHash}&select=id,status,row_counts`,
    ) as Array<{ id: string; status: string; row_counts: Record<string, number> }>;
    if (existing?.[0]?.status === "parsed") {
      stage = "refresh_existing_package";
      const refresh = await supabaseFetch("/rest/v1/rpc/refresh_agentetome_existing_package", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          p_package_hash: packageHash,
          p_runtime: RUNTIME,
          p_trigger_type: `agentetome_${triggerType}`,
        }),
      });
      return jsonResponse(200, {
        status: "real",
        mode: "idempotent_existing_package",
        packageId: existing[0].id,
        packageHash,
        rows: existing[0].row_counts,
        refresh,
        rawDownloadLinkPersisted: false,
      }, RUNTIME);
    }

    stage = "create_connector_run";
    connectorRunId = crypto.randomUUID();
    await insertRow("source_connector_runs", {
      id: connectorRunId,
      company_id: null,
      source_id: sourceId,
      scope_type: "administrator",
      trigger_type: `agentetome_${triggerType}`,
      status: "running",
      started_at: startedAt,
      finished_at: null,
      items_collected: 0,
      outputs_written: 0,
      signals_written: 0,
      enrichments_written: 0,
      error_message: null,
      metadata: {
        source_code: "src_agentetome_api",
        administrator,
        cut,
        competence,
        format,
        trigger_type: triggerType,
        schema_version: schemaVersion,
        runtime: RUNTIME,
      },
    });

    const generatedDate = providerGeneratedAt.slice(0, 10);
    const storagePath = `administrator=${slug(administrator)}/cut=${cut}/generated=${generatedDate}/${packageHash}.zip`;
    const storageUrl = `storage://${AGENTETOME_BUCKET}/${storagePath}`;

    stage = "validate_archive";
    const parsed = await parseAgentetomeArchive({
      zipBytes,
      expectedHash: packageHash,
      expectedSize,
      expectedRows: manifest.arquivos ?? {},
      storageUrl,
      schemaVersion,
    });

    stage = "store_private_zip";
    const storageResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${AGENTETOME_BUCKET}/${storageObjectPath(storagePath)}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "content-type": "application/zip",
          "x-upsert": "true",
        },
        body: zipBytes,
      },
    );
    if (!storageResponse.ok) throw new Error(`storage_upload_http_${storageResponse.status}`);

    stage = "register_package";
    const packageRows = await upsertRows("agentetome_export_packages", [{
      source_id: sourceId,
      connector_run_id: connectorRunId,
      operation_run_id: null,
      administrator,
      cut,
      competence,
      format,
      schema_version: schemaVersion,
      provider_file_name: providerFileName,
      provider_generated_at: providerGeneratedAt,
      provider_expires_at: providerExpiresAt,
      storage_bucket: AGENTETOME_BUCKET,
      storage_path: storagePath,
      content_hash: packageHash,
      size_bytes: zipBytes.length,
      mime_type: download.headers.get("content-type") ?? "application/zip",
      file_count: parsed.fileCount,
      row_counts: parsed.rowCounts,
      headers: parsed.headers,
      status: "stored",
      metadata: {
        manifest,
        runtime: RUNTIME,
        trigger_type: triggerType,
        ingestion_mode: "direct_export",
        raw_download_link_persisted: false,
      },
    }], "content_hash");
    const packageId = String(packageRows[0]?.id ?? existing?.[0]?.id ?? "");
    if (!packageId) throw new Error("package_registration_failed");

    stage = "write_bronze";
    await writeBronze(parsed.bronzeRows);

    stage = "finalize_and_sync_silver";
    const result = await supabaseFetch("/rest/v1/rpc/finalize_agentetome_direct_package_v2", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        p_package_id: packageId,
        p_headers: parsed.headers,
        p_row_counts: parsed.rowCounts,
        p_bronze_rows: parsed.bronzeRows.length,
        p_runtime: RUNTIME,
      }),
    });

    return jsonResponse(200, {
      status: "real",
      packageId,
      connectorRunId,
      schemaVersion,
      packageHash,
      sizeBytes: zipBytes.length,
      storage: { bucket: AGENTETOME_BUCKET, path: storagePath },
      files: parsed.rowCounts,
      bronzeRowsWritten: parsed.bronzeRows.length,
      result,
      rawDownloadLinkPersisted: false,
    }, RUNTIME);
  } catch (error) {
    const detail = `${stage}:${errorMessage(error)}`.slice(0, 900);
    if (connectorRunId) {
      try {
        await patchRow("source_connector_runs", connectorRunId, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: detail,
        });
      } catch { /* best-effort audit */ }
    }
    if (administrator) {
      try {
        await supabaseFetch("/rest/v1/rpc/record_agentetome_target_failure", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            p_administrator: administrator,
            p_error: detail,
            p_runtime: RUNTIME,
          }),
        });
      } catch { /* best-effort control-plane update */ }
    }
    console.error(`[${RUNTIME}] ${detail}`);
    return jsonResponse(500, { status: "failed", stage, error: errorMessage(error) }, RUNTIME);
  }
});
