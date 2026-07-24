import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const RUNTIME = 'knowledge-embedding-worker-v10-vercel';
const VOYAGE_MODEL = 'voyage-3.5';
const EMBEDDING_DIMENSIONS = 1024;

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const isAuthorized = (req: IncomingMessage) => {
  const secret = process.env.CRON_SECRET ?? '';
  const authorization = getHeader(req, 'authorization') ?? '';
  return Boolean(secret && safeEqual(authorization, `Bearer ${secret}`));
};

const deploymentMetadata = () => ({
  deploymentCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  deploymentEnvironment: process.env.VERCEL_ENV ?? null,
  deploymentUrl: process.env.VERCEL_URL ?? null,
});

type WorkerInput = {
  batchSize?: unknown;
  dailyLimit?: unknown;
  leaseSeconds?: unknown;
  workerId?: unknown;
};

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
  status: 'claimed' | 'empty' | 'budget_exhausted';
  workerId: string;
  dailyLimit: number;
  completedToday: number;
  remainingBudget: number;
  jobs: ClaimedJob[];
};

type VoyageResponse = {
  data?: Array<{ index?: number; embedding?: number[] }>;
  usage?: { total_tokens?: number };
};

const parseInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const readBody = async (req: IncomingMessage): Promise<WorkerInput> => {
  const requestWithBody = req as IncomingMessage & { body?: unknown };
  if (requestWithBody.body && typeof requestWithBody.body === 'object') {
    return requestWithBody.body as WorkerInput;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > 32_768) throw new Error('Request body exceeds 32KB.');
    chunks.push(buffer);
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as WorkerInput;
};

const rpc = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service runtime is not configured.');

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
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
    return await rpc<Record<string, unknown>>('knowledge_fail_embedding_job', {
      p_job_id: job.jobId,
      p_worker_id: workerId,
      p_error: error,
      p_retry_after_seconds: retryAfterSeconds ?? null,
    });
  } catch (releaseError) {
    console.error(
      `[${RUNTIME}] failed_to_release_job`,
      job.jobId,
      releaseError instanceof Error ? releaseError.message : String(releaseError),
    );
    return { status: 'release_failed', jobId: job.jobId };
  }
};

const isValidEmbedding = (value: unknown): value is number[] => Array.isArray(value)
  && value.length === EMBEDDING_DIMENSIONS
  && value.every((item) => typeof item === 'number' && Number.isFinite(item));

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    writeJson(res, 405, {
      status: 'error',
      error: 'method_not_allowed',
      runtime: RUNTIME,
      ...deploymentMetadata(),
    });
    return;
  }

  if (!isAuthorized(req)) {
    writeJson(res, 401, {
      status: 'error',
      error: 'unauthorized',
      runtime: RUNTIME,
      ...deploymentMetadata(),
    });
    return;
  }

  const voyageApiKey = process.env.VOYAGE_API_KEY ?? '';
  if (!voyageApiKey) {
    writeJson(res, 503, {
      status: 'error',
      error: 'voyage_api_key_unavailable',
      runtime: RUNTIME,
      ...deploymentMetadata(),
    });
    return;
  }

  try {
    const body = await readBody(req);
    const batchSize = parseInteger(body.batchSize, 32, 1, 128);
    const dailyLimit = parseInteger(body.dailyLimit, 128, 1, 5000);
    const leaseSeconds = parseInteger(body.leaseSeconds, 600, 60, 3600);
    const workerId = String(body.workerId ?? `vercel-${crypto.randomUUID().slice(0, 12)}`)
      .trim()
      .slice(0, 120);

    const claim = await rpc<ClaimResponse>('knowledge_claim_embedding_jobs', {
      p_worker_id: workerId,
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
      p_daily_limit: dailyLimit,
    });

    if (claim.status !== 'claimed' || claim.jobs.length === 0) {
      const coverage = await rpc<Record<string, unknown>>('knowledge_embedding_coverage', {});
      writeJson(res, 200, {
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
        runtime: RUNTIME,
        ...deploymentMetadata(),
      });
      return;
    }

    const voyageResponse = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${voyageApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: claim.jobs.map((job) => job.content),
        model: VOYAGE_MODEL,
        input_type: 'document',
        output_dimension: EMBEDDING_DIMENSIONS,
        truncation: true,
      }),
    });

    const requestId = voyageResponse.headers.get('x-request-id')
      ?? voyageResponse.headers.get('request-id')
      ?? null;
    const retryAfterHeader = Number(voyageResponse.headers.get('retry-after') ?? '');
    const retryAfterSeconds = Number.isFinite(retryAfterHeader)
      ? Math.min(86_400, Math.max(30, Math.trunc(retryAfterHeader)))
      : undefined;
    const rawVoyage = await voyageResponse.text();

    if (!voyageResponse.ok) {
      const error = `Voyage HTTP ${voyageResponse.status}: ${rawVoyage.slice(0, 1500)}`;
      const releases = await Promise.all(
        claim.jobs.map((job) => scheduleFailure(job, workerId, error, retryAfterSeconds)),
      );
      writeJson(res, voyageResponse.status >= 500 ? 502 : 424, {
        status: 'provider_error',
        workerId,
        claimed: claim.jobs.length,
        completed: 0,
        failed: claim.jobs.length,
        requestId,
        releases,
        syntheticEmbedding: false,
        runtime: RUNTIME,
        ...deploymentMetadata(),
      });
      return;
    }

    let voyagePayload: VoyageResponse;
    try {
      voyagePayload = JSON.parse(rawVoyage) as VoyageResponse;
    } catch {
      const releases = await Promise.all(
        claim.jobs.map((job) => scheduleFailure(job, workerId, 'Voyage returned invalid JSON.')),
      );
      writeJson(res, 502, {
        status: 'provider_payload_invalid',
        workerId,
        claimed: claim.jobs.length,
        completed: 0,
        failed: claim.jobs.length,
        requestId,
        releases,
        syntheticEmbedding: false,
        runtime: RUNTIME,
        ...deploymentMetadata(),
      });
      return;
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

      if (!isValidEmbedding(embedding)) {
        outcomes.push(await scheduleFailure(
          job,
          workerId,
          `Invalid Voyage embedding at index ${index}; expected ${EMBEDDING_DIMENSIONS} finite values.`,
        ));
        continue;
      }

      try {
        outcomes.push(await rpc<Record<string, unknown>>('knowledge_complete_embedding_job', {
          p_job_id: job.jobId,
          p_worker_id: workerId,
          p_embedding: `[${embedding.join(',')}]`,
          p_provider_request_id: requestId,
          p_usage_tokens: tokensPerJob,
        }));
      } catch (completionError) {
        outcomes.push(await scheduleFailure(
          job,
          workerId,
          completionError instanceof Error ? completionError.message : String(completionError),
        ));
      }
    }

    const completed = outcomes.filter((outcome) => outcome.status === 'completed').length;
    const failed = outcomes.length - completed;
    const coverage = await rpc<Record<string, unknown>>('knowledge_embedding_coverage', {});

    writeJson(res, failed === 0 ? 200 : 207, {
      status: failed === 0 ? 'completed' : 'partial',
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
      runtime: RUNTIME,
      ...deploymentMetadata(),
    });
  } catch (error) {
    console.error(`[${RUNTIME}] request_failed`, error);
    writeJson(res, 500, {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      syntheticEmbedding: false,
      runtime: RUNTIME,
      ...deploymentMetadata(),
    });
  }
}
