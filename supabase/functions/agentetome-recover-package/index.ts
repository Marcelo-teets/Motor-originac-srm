import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  AGENTETOME_BUCKET,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  claimOneTimeToken,
  errorMessage,
  jsonResponse,
  parseAgentetomeArchive,
  storageObjectPath,
  supabaseFetch,
  writeBronze,
} from "../_shared/agentetome.ts";

const RUNTIME = "agentetome-recover-package-v1";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { status: "error", error: "method_not_allowed" }, RUNTIME);

  let stage = "authenticate";
  try {
    const metadata = await claimOneTimeToken(req.headers.get("x-ingestion-token")?.trim() ?? "");
    const packageId = String(metadata.package_id ?? "");
    if (!packageId) throw new Error("package_id_missing");

    stage = "read_package";
    const packages = await supabaseFetch(
      `/rest/v1/agentetome_export_packages?id=eq.${encodeURIComponent(packageId)}&select=*`,
    ) as Array<Record<string, any>>;
    const pkg = packages?.[0];
    if (!pkg) throw new Error("package_not_found");
    if (Number(pkg.schema_version) !== 1) throw new Error("unsupported_schema");

    stage = "download_private_zip";
    const download = await fetch(
      `${SUPABASE_URL}/storage/v1/object/authenticated/${encodeURIComponent(pkg.storage_bucket)}/${storageObjectPath(pkg.storage_path)}`,
      { headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!download.ok) throw new Error(`storage_download_http_${download.status}`);
    const zipBytes = new Uint8Array(await download.arrayBuffer());
    const storageUrl = `storage://${pkg.storage_bucket}/${pkg.storage_path}`;

    stage = "validate_archive";
    const parsed = await parseAgentetomeArchive({
      zipBytes,
      expectedHash: String(pkg.content_hash),
      expectedSize: Number(pkg.size_bytes),
      expectedRows: pkg.row_counts ?? {},
      storageUrl,
      schemaVersion: Number(pkg.schema_version),
    });

    stage = "write_bronze";
    await writeBronze(parsed.bronzeRows);

    stage = "finalize";
    const result = await supabaseFetch("/rest/v1/rpc/finalize_agentetome_recovered_package", {
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
      packageHash: parsed.packageHash,
      bronzeRowsWritten: parsed.bronzeRows.length,
      files: parsed.rowCounts,
      result,
      rawDownloadLinkPersisted: false,
    }, RUNTIME);
  } catch (error) {
    const message = errorMessage(error);
    console.error(`[${RUNTIME}] ${stage}:${message}`);
    return jsonResponse(500, { status: "failed", stage, error: message }, RUNTIME);
  }
});
