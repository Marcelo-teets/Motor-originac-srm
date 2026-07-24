import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RUNTIME = "knowledge-embedding-worker-v10";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VOYAGE_API_KEY = Deno.env.get("VOYAGE_API_KEY") ?? "";
const VOYAGE_MODEL = "voyage-3.5";
const EMBEDDING_DIMENSIONS = 1024;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const respond = (status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify({ ...body, runtime: RUNTIME }),
  {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  },
);

type ClaimedJob = {
  jobId: string;
  vectorDocumentId: string;
  content: string;
  metadata: Record<string, unknown>;
  model: string;
  dimensions: number;
  contentSha256: string;
  attempt: number;
  maxAttempts: number;
};

type ClaimResponse = {
  status: "claimed" | "empty" | "budget_exhausted";
  workerId: string;
  dailyLimit: number;
  completedToday: number;
  remainingBudget: number;
  jobs: ClaimedJob[];
};

type VoyageEmbedding = {
  index?: number;
  embedding?: number[];
};

type VoyageResponse = {
  data?: VoyageEmbedding[];
  usage?: {
    total_tokens?: number;
  };
};

const parseInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const parseJwtPayload = (authorization: string): Record<string, unknown> | null => {
  try {
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    const segment = token.split(".")[1];
    if (!segment) return null;
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const rpc = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }

  if (!response.ok) {
    throw new Error(`RPC ${name} failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload as T;
};

const scheduleFailure = async (
  job: ClaimedJob,
  workerId: string,
  error: string,
  retryAfterSeconds?: number,
) => {
  try {
    return await rpc<Record<string, unknown>>("knowledge_fail_embedding_job", {
      p_job_id: job.jobId,
      p_worker_id: workerId,
      p_error: error,
      p_retry_after_seconds: retryAfterSeconds ?? null,
    });
  } catch (failureError) {
    console.error(
      `[${RUNTIME}] failed_to_release_job`,
      job.jobId,
      failureError instanceof Error ? failureError.message : String(failureError),
    );
    return { status: "release_failed", jobId: job.jobId };
  }
};

const validateEmbedding = (value: unknown): value is number[] => Array.isArray(value)
  && value.length === EMBEDDING_DIMENSIONS
  && value.every((item) => typeof item === "number" && Number.isFinite(item));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { status: "error", error: "method_not_allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return respond(500, { status: "error", error: "supabase_runtime_not_configured" });
  }
  if (!VOYAGE_API_KEY) {
    return respond(503, { status: "error", error: "voyage_api_key_unavailable" });
  }

  const authorization = req.headers.get("authorization")?.trim() ?? "";
  const jwtPayload = parseJwtPayload(authorization);
  if (jwtPayload?.role !== "service_role" || authorization !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return respond(403, { status: "error", error: "service_role_required" });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      batchSize?: unknown;
      dailyLimit?: unknown;
      leaseSeconds?: unknown;
      workerId?: unknown;
    };

    const batchSize = parseInteger(body.batchSize, 32, 1, 128);
    const dailyLimit = parseInteger(body.dailyLimit, 128, 1, 5000);
    const leaseSeconds = parseInteger(body.leaseSeconds, 300, 60, 3600);
    const workerId = String(
      body.workerId
        ?? `edge-${crypto.randomUUID().slice(0, 12)}`,
    ).trim().slice(0, 120);

    const claim = await rpc<ClaimResponse>("knowledge_claim_embedding_jobs", {
      p_worker_id: workerId,
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
      p_daily_limit: dailyLimit,
    });

    if (claim.status !== "claimed" || claim.jobs.length === 0) {
      const coverage = await rpc<Record<string, unknown>>("knowledge_embedding_coverage", {});
      return respond(200, {
        status: claim.status,
        workerId,
        claimed: 0,
        completed: 0,
        failed: 0,
        dailyLimit: claim.dailyLimit,
        completedToday: claim.completedToday,
        remainingBudget: claim.remainingBudget,
        coverage,
        syntheticEmbedding: false,
      });
    }

    const voyageResponse = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${VOYAGE_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: claim.jobs.map((job) => job.content),
        model: VOYAGE_MODEL,
        input_type: "document",
        output_dimension: EMBEDDING_DIMENSIONS,
        truncation: true,
      }),
    });

    const requestId = voyageResponse.headers.get("x-request-id")
      ?? voyageResponse.headers.get("request-id")
      ?? null;
    const retryAfterHeader = Number(voyageResponse.headers.get("retry-after") ?? "");
    const retryAfterSeconds = Number.isFinite(retryAfterHeader)
      ? Math.min(86400, Math.max(30, Math.trunc(retryAfterHeader)))
      : undefined;
    const rawVoyage = await voyageResponse.text();

    if (!voyageResponse.ok) {
      const error = `Voyage HTTP ${voyageResponse.status}: ${rawVoyage.slice(0, 1500)}`;
      const releases = await Promise.all(
        claim.jobs.map((job) => scheduleFailure(job, workerId, error, retryAfterSeconds)),
      );
      return respond(voyageResponse.status >= 500 ? 502 : 424, {
        status: "provider_error",
        workerId,
        claimed: claim.jobs.length,
        completed: 0,
        failed: claim.jobs.length,
        requestId,
        releases,
        syntheticEmbedding: false,
      });
    }

    let voyagePayload: VoyageResponse;
    try {
      voyagePayload = JSON.parse(rawVoyage) as VoyageResponse;
    } catch {
      const error = "Voyage returned invalid JSON";
      const releases = await Promise.all(
        claim.jobs.map((job) => scheduleFailure(job, workerId, error)),
      );
      return respond(502, {
        status: "provider_payload_invalid",
        workerId,
        claimed: claim.jobs.length,
        completed: 0,
        failed: claim.jobs.length,
        requestId,
        releases,
        syntheticEmbedding: false,
      });
    }

    const embeddings = [...(voyagePayload.data ?? [])].sort(
      (left, right) => Number(left.index ?? 0) - Number(right.index ?? 0),
    );
    const totalTokens = Number(voyagePayload.usage?.total_tokens ?? 0);
    const tokensPerJob = claim.jobs.length > 0 && Number.isFinite(totalTokens)
      ? Math.max(0, Math.ceil(totalTokens / claim.jobs.length))
      : null;

    const outcomes: Array<Record<string, unknown>> = [];
    for (let index = 0; index < claim.jobs.length; index += 1) {
      const job = claim.jobs[index];
      const embedding = embeddings[index]?.embedding;

      if (!validateEmbedding(embedding)) {
        outcomes.push(await scheduleFailure(
          job,
          workerId,
          `Invalid Voyage embedding at index ${index}; expected ${EMBEDDING_DIMENSIONS} finite values`,
        ));
        continue;
      }

      try {
        outcomes.push(await rpc<Record<string, unknown>>("knowledge_complete_embedding_job", {
          p_job_id: job.jobId,
          p_worker_id: workerId,
          p_embedding: `[${embedding.join(",")}]`,
          p_provider_request_id: requestId,
          p_usage_tokens: tokensPerJob,
        }));
      } catch (completionError) {
        const message = completionError instanceof Error
          ? completionError.message
          : String(completionError);
        outcomes.push(await scheduleFailure(job, workerId, message));
      }
    }

    const completed = outcomes.filter((outcome) => outcome.status === "completed").length;
    const failed = outcomes.length - completed;
    const coverage = await rpc<Record<string, unknown>>("knowledge_embedding_coverage", {});

    return respond(failed === 0 ? 200 : 207, {
      status: failed === 0 ? "completed" : "partial",
      workerId,
      claimed: claim.jobs.length,
      completed,
      failed,
      model: VOYAGE_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      requestId,
      totalTokens: Number.isFinite(totalTokens) ? totalTokens : null,
      outcomes,
      coverage,
      syntheticEmbedding: false,
    });
  } catch (error) {
    console.error(`[${RUNTIME}] request_failed`, error);
    return respond(500, {
      status: "error",
      error: error instanceof Error ? error.message : "unexpected_error",
      syntheticEmbedding: false,
    });
  }
});
