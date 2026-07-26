import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RUNTIME = "agentetome-validate-xml-v1";
const MAX_XML_BYTES = 5 * 1024 * 1024;
const PROVIDER_URL = "https://www.agentetome.com/api/v1/validar-xml";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

class ValidationError extends Error {
  constructor(message: string, readonly statusCode = 500, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "ValidationError";
  }
}

const jsonResponse = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-origination-runtime": RUNTIME,
  },
});

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const parseRetryAfter = (value: string | null) => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
};

const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const decodeXml = (value: string) => {
  const compact = String(value ?? "").replace(/\s+/g, "");
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) throw new ValidationError("xmlBase64 inválido.", 400);

  let binary = "";
  try { binary = atob(compact); } catch { throw new ValidationError("xmlBase64 inválido.", 400); }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (!bytes.length) throw new ValidationError("O XML está vazio.", 400);
  if (bytes.length > MAX_XML_BYTES) throw new ValidationError("O XML excede o limite de 5 MB do Agentetome.", 413);

  const preview = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 256))).trimStart();
  if (!preview.startsWith("<")) throw new ValidationError("O conteúdo decodificado não parece ser XML.", 422);
  return bytes;
};

async function serviceRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new ValidationError("Supabase service runtime is not configured.", 503);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (!response.ok) throw new ValidationError(`RPC ${name} failed (${response.status}).`, 502);
  return payload as T;
}

async function resolveUser(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new ValidationError("Missing bearer token.", 401);
  if (!SUPABASE_URL || !ANON_KEY) throw new ValidationError("Supabase Auth is not configured.", 503);

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, authorization },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof payload.id !== "string") throw new ValidationError("Unauthorized.", 401);
  return { id: payload.id, authorization };
}

async function recordAudit(input: {
  userId: string;
  status: "completed" | "partial" | "failed" | "blocked";
  httpStatus: number;
  durationMs: number;
  fingerprint: string;
  responseSummary: Record<string, unknown>;
  retryAfterSeconds?: number;
}) {
  await serviceRpc("record_agentetome_validation_audit", {
    p_requested_by: input.userId,
    p_status: input.status,
    p_http_status: input.httpStatus,
    p_duration_ms: input.durationMs,
    p_request_fingerprint: input.fingerprint,
    p_response_summary: input.responseSummary,
    p_retry_after_seconds: input.retryAfterSeconds ?? null,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { status: "error", error: "method_not_allowed" });

  const startedAt = Date.now();
  let userId = "";
  let fingerprint = "";
  let xmlBytes = 0;

  try {
    const user = await resolveUser(req);
    userId = user.id;
    const body = await req.json().catch(() => ({})) as { xmlBase64?: string; xml_base64?: string };
    const bytes = decodeXml(String(body.xmlBase64 ?? body.xml_base64 ?? ""));
    xmlBytes = bytes.length;
    fingerprint = await sha256Hex(bytes);

    const keyPayload = await serviceRpc<unknown>("get_agentetome_runtime_secret", {});
    const apiKey = typeof keyPayload === "string" ? keyPayload : "";
    if (!apiKey) throw new ValidationError("Agentetome secret is not configured in Supabase Vault.", 503);

    const form = new FormData();
    form.append("arquivo", new Blob([bytes], { type: "application/xml" }), "informe.xml");

    const provider = await fetch(PROVIDER_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      body: form,
    });
    const retryAfterSeconds = parseRetryAfter(provider.headers.get("retry-after"));
    const raw = await provider.text();
    let report: Record<string, unknown> = {};
    try { report = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { report = { error: raw.slice(0, 500) }; }

    const auditStatus = provider.status === 429 || provider.status === 503
      ? "blocked" as const
      : provider.status === 422
        ? "partial" as const
        : provider.ok
          ? "completed" as const
          : "failed" as const;

    await recordAudit({
      userId,
      status: auditStatus,
      httpStatus: provider.status,
      durationMs: Date.now() - startedAt,
      fingerprint,
      retryAfterSeconds,
      responseSummary: {
        ok: report.ok ?? null,
        leiaute: report.leiaute ?? null,
        contadores: report.contadores ?? {},
        xmlBytes,
        rawXmlPersisted: false,
        providerDiscardsXml: true,
      },
    });

    return jsonResponse(provider.status, {
      status: provider.ok ? "real" : provider.status === 422 ? "partial" : "failed",
      generatedAt: new Date().toISOString(),
      data: report,
      metadata: {
        requestFingerprint: fingerprint,
        xmlBytes,
        rawXmlPersisted: false,
        providerDiscardsXml: true,
        sentToCvm: false,
      },
      retryAfterSeconds,
    });
  } catch (error) {
    const statusCode = error instanceof ValidationError ? error.statusCode : 500;
    const retryAfterSeconds = error instanceof ValidationError ? error.retryAfterSeconds : undefined;
    if (userId && fingerprint) {
      await recordAudit({
        userId,
        status: statusCode === 429 || statusCode === 503 ? "blocked" : "failed",
        httpStatus: statusCode,
        durationMs: Date.now() - startedAt,
        fingerprint,
        retryAfterSeconds,
        responseSummary: {
          error: errorMessage(error),
          xmlBytes,
          rawXmlPersisted: false,
          providerDiscardsXml: true,
        },
      }).catch(() => undefined);
    }
    console.error(`[${RUNTIME}]`, errorMessage(error));
    return jsonResponse(statusCode, {
      status: "failed",
      generatedAt: new Date().toISOString(),
      error: errorMessage(error),
      retryAfterSeconds,
      metadata: { rawXmlPersisted: false, providerDiscardsXml: true, sentToCvm: false },
    });
  }
});
