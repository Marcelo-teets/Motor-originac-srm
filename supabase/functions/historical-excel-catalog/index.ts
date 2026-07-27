import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const RUNTIME = "historical-excel-catalog-v2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ARCHIVE_BUCKET = "historical-excel-archive";
const GOOGLE_DRIVE_CLIENT_ID = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID") ?? "";
const GOOGLE_DRIVE_CLIENT_SECRET = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET") ?? "";
const GOOGLE_DRIVE_REFRESH_TOKEN = Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN") ?? "";
const encoder = new TextEncoder();

let googleTokenCache: { accessToken: string; expiresAt: number } | null = null;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-archive-token",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-origination-runtime": RUNTIME,
    },
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function claimSystemAction(req: Request): Promise<string | null> {
  const rawToken = req.headers.get("x-archive-token")?.trim() ?? "";
  if (!rawToken) return null;

  const { data, error } = await admin.rpc("claim_data_archive_token", {
    p_token_hash: await sha256Hex(rawToken),
  });
  if (error || !data?.metadata?.action) throw new Error("invalid_or_expired_archive_token");
  return String(data.metadata.action);
}

async function requireGodMode(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("authentication_required");

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Error("invalid_user_session");

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("id, role, status")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "god_mode" || profile?.status !== "active") {
    throw new Error("god_mode_required");
  }

  return userData.user;
}

function numberParam(url: URL, name: string, fallback: number, max: number) {
  const parsed = Number(url.searchParams.get(name) ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.trunc(parsed)));
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
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await tokenResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!tokenResponse.ok || !payload.access_token) {
    throw new Error(`google_oauth_${tokenResponse.status}:${JSON.stringify(payload).slice(0, 500)}`);
  }

  const accessToken = String(payload.access_token);
  const expiresIn = Number(payload.expires_in ?? 3600);
  googleTokenCache = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  return accessToken;
}

async function deleteGoogleDriveFile(fileId: string) {
  const accessToken = await googleAccessToken();
  const deleteResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    throw new Error(`google_drive_delete_${deleteResponse.status}:${(await deleteResponse.text()).slice(0, 500)}`);
  }
}

async function listCatalog(url: URL) {
  const limit = Math.max(1, numberParam(url, "limit", 50, 100));
  const offset = numberParam(url, "offset", 0, 100_000);
  const tableName = url.searchParams.get("table")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";
  const runId = url.searchParams.get("runId")?.trim() ?? "";

  if (runId) {
    const { data: parts, error } = await admin
      .from("data_archive_parts")
      .select("id, run_id, part_number, workbook_name, storage_provider, storage_bucket, storage_path, external_file_id, external_folder_id, external_url, migrated_at, row_count, min_record_at, max_record_at, sha256, size_bytes, created_at")
      .eq("run_id", runId)
      .order("part_number", { ascending: true });
    if (error) throw error;
    return { status: "ok", runId, parts: parts ?? [] };
  }

  let runsQuery = admin
    .from("data_archive_runs")
    .select("id, table_name, dataset_code, cutoff_at, include_raw_payload, chunk_rows, status, storage_provider, storage_bucket, row_count, part_count, requested_by, started_at, completed_at, verified_at, pruned_at, error_message, request_metadata, export_metadata, prune_result, created_at, updated_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (tableName) runsQuery = runsQuery.eq("table_name", tableName);
  if (status) runsQuery = runsQuery.eq("status", status);

  const [
    { data: runs, error: runsError, count },
    { data: policies, error: policiesError },
    { data: allRuns, error: summaryError },
    { data: allParts, error: partsError },
    { data: healthRows, error: healthError },
  ] = await Promise.all([
    runsQuery,
    admin.from("data_archive_policies").select("table_name, dataset_code, retention_mode, hot_retention_days, allow_prune, enabled, excel_sheet_prefix, notes").order("table_name").order("dataset_code"),
    admin.from("data_archive_runs").select("status, storage_provider, row_count, part_count"),
    admin.from("data_archive_parts").select("run_id, storage_provider, size_bytes, row_count"),
    admin.from("database_storage_snapshots").select("database_bytes, target_bytes, warning_bytes, critical_bytes, free_quota_bytes, state, captured_at").order("captured_at", { ascending: false }).limit(1),
  ]);

  if (runsError) throw runsError;
  if (policiesError) throw policiesError;
  if (summaryError) throw summaryError;
  if (partsError) throw partsError;
  if (healthError) throw healthError;

  const runSize = new Map<string, number>();
  for (const part of allParts ?? []) {
    runSize.set(String(part.run_id), (runSize.get(String(part.run_id)) ?? 0) + Number(part.size_bytes ?? 0));
  }

  const enrichedRuns = (runs ?? []).map((run) => ({
    ...run,
    size_bytes: runSize.get(String(run.id)) ?? 0,
  }));

  const summary = {
    runs: (allRuns ?? []).length,
    verified_runs: (allRuns ?? []).filter((run) => run.status === "verified").length,
    pruned_runs: (allRuns ?? []).filter((run) => run.status === "pruned").length,
    failed_runs: (allRuns ?? []).filter((run) => run.status === "failed").length,
    running_runs: (allRuns ?? []).filter((run) => ["queued", "running", "completed"].includes(String(run.status))).length,
    archived_rows: (allRuns ?? [])
      .filter((run) => ["verified", "pruned"].includes(String(run.status)))
      .reduce((sum, run) => sum + Number(run.row_count ?? 0), 0),
    pruned_rows: (allRuns ?? [])
      .filter((run) => run.status === "pruned")
      .reduce((sum, run) => sum + Number(run.row_count ?? 0), 0),
    storage_bytes: (allParts ?? []).reduce((sum, part) => sum + Number(part.size_bytes ?? 0), 0),
    supabase_storage_bytes: (allParts ?? [])
      .filter((part) => String(part.storage_provider ?? "supabase_storage") === "supabase_storage")
      .reduce((sum, part) => sum + Number(part.size_bytes ?? 0), 0),
    google_drive_bytes: (allParts ?? [])
      .filter((part) => String(part.storage_provider) === "google_drive")
      .reduce((sum, part) => sum + Number(part.size_bytes ?? 0), 0),
    parts: (allParts ?? []).length,
  };

  return {
    status: "ok",
    summary,
    storage_health: healthRows?.[0] ?? null,
    filters: { table: tableName || null, status: status || null, limit, offset },
    total: count ?? enrichedRuns.length,
    runs: enrichedRuns,
    policies: policies ?? [],
  };
}

async function archiveDownload(partId: string) {
  const { data: part, error: partError } = await admin
    .from("data_archive_parts")
    .select("id, workbook_name, storage_provider, storage_bucket, storage_path, external_file_id, external_url")
    .eq("id", partId)
    .maybeSingle();
  if (partError) throw partError;
  if (!part) throw new Error("archive_part_not_found");

  if (String(part.storage_provider) === "google_drive") {
    const externalUrl = String(
      part.external_url || (part.external_file_id ? `https://drive.google.com/file/d/${part.external_file_id}/view` : ""),
    );
    if (!externalUrl) throw new Error("google_drive_archive_url_missing");
    return {
      status: "ok",
      provider: "google_drive",
      partId,
      workbookName: part.workbook_name,
      expiresIn: 0,
      signedUrl: externalUrl,
    };
  }

  const { data, error } = await admin.storage
    .from(part.storage_bucket || ARCHIVE_BUCKET)
    .createSignedUrl(part.storage_path, 300, { download: part.workbook_name });
  if (error || !data?.signedUrl) throw error ?? new Error("signed_url_not_created");

  return {
    status: "ok",
    provider: "supabase_storage",
    partId,
    workbookName: part.workbook_name,
    expiresIn: 300,
    signedUrl: data.signedUrl,
  };
}

async function cleanupFailedArchives() {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: runs, error: runsError } = await admin
    .from("data_archive_runs")
    .select("id, table_name, dataset_code, request_metadata, export_metadata, created_at, completed_at")
    .eq("status", "failed")
    .or(`completed_at.lt.${cutoff},and(completed_at.is.null,created_at.lt.${cutoff})`)
    .limit(200);
  if (runsError) throw runsError;

  let deletedObjects = 0;
  let deletedParts = 0;
  let releasedBytes = 0;

  for (const run of runs ?? []) {
    const { data: parts, error: partsError } = await admin
      .from("data_archive_parts")
      .select("id, storage_provider, storage_bucket, storage_path, external_file_id, size_bytes, row_count")
      .eq("run_id", run.id);
    if (partsError) throw partsError;

    const byBucket = new Map<string, string[]>();
    for (const part of parts ?? []) {
      const provider = String(part.storage_provider ?? "supabase_storage");
      if (provider === "google_drive") {
        if (part.external_file_id) await deleteGoogleDriveFile(String(part.external_file_id));
        deletedObjects += 1;
      } else {
        const bucket = String(part.storage_bucket || ARCHIVE_BUCKET);
        byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), String(part.storage_path)]);
      }
      releasedBytes += Number(part.size_bytes ?? 0);
    }

    for (const [bucket, paths] of byBucket) {
      for (let index = 0; index < paths.length; index += 1000) {
        const slice = paths.slice(index, index + 1000);
        const { error } = await admin.storage.from(bucket).remove(slice);
        if (error) throw error;
        deletedObjects += slice.length;
      }
    }

    if ((parts ?? []).length) {
      const { error } = await admin.from("data_archive_parts").delete().eq("run_id", run.id);
      if (error) throw error;
      deletedParts += parts!.length;
    }

    const cleanup = {
      cleaned_at: new Date().toISOString(),
      deleted_objects: (parts ?? []).length,
      released_bytes: (parts ?? []).reduce((sum, part) => sum + Number(part.size_bytes ?? 0), 0),
      reason: "failed_run_artifact_cleanup",
    };
    const { error: updateError } = await admin
      .from("data_archive_runs")
      .update({
        part_count: 0,
        request_metadata: { ...(run.request_metadata ?? {}), cleanup },
        export_metadata: { ...(run.export_metadata ?? {}), failed_artifacts_cleaned: true },
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    if (updateError) throw updateError;
  }

  const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const expiredDelete = await admin
    .from("data_archive_tokens")
    .delete({ count: "exact" })
    .lt("expires_at", staleCutoff);
  if (expiredDelete.error) throw expiredDelete.error;

  return {
    status: "cleaned",
    runs: (runs ?? []).length,
    deletedObjects,
    deletedParts,
    releasedBytes,
    deletedTokens: expiredDelete.count ?? 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("supabase_runtime_credentials_missing");

    if (req.method === "GET") {
      await requireGodMode(req);
      return response(200, await listCatalog(new URL(req.url)));
    }

    if (req.method !== "POST") return response(405, { status: "error", error: "method_not_allowed" });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const systemAction = await claimSystemAction(req);

    if (systemAction) {
      if (systemAction !== action || action !== "cleanup_failed") throw new Error("archive_system_action_mismatch");
      return response(200, await cleanupFailedArchives());
    }

    await requireGodMode(req);
    if (action === "download") return response(200, await archiveDownload(String(body.partId ?? "")));
    if (action === "cleanup_failed") return response(200, await cleanupFailedArchives());

    return response(400, { status: "error", error: "unsupported_action" });
  } catch (error) {
    const message = errorMessage(error);
    const status = message === "authentication_required" || message === "invalid_user_session"
      ? 401
      : message === "god_mode_required" ? 403 : 500;
    console.error(`[${RUNTIME}] ${message}`);
    return response(status, { status: "error", error: message });
  }
});
