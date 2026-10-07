import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { createPlatformRepository } from '../backend/src/repositories/platformRepository.js';
import { PlatformService } from '../backend/src/services/platformService.js';
import { requireNeonDataClient } from './neon-data.js';
import { getHeader, readJsonBody } from './http.js';

type JsonObject = Record<string, unknown>;
export type PaperclipUser = { id: string; email?: string };
export type PaperclipResponse = { statusCode: number; data: unknown };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set([
  'recompute_company',
  'refresh_monitoring_company',
  'process_reprocessing_queue',
  'create_task',
  'run_suggested_improvements',
]);

const text = (...values: unknown[]) => String(values.find((value) => typeof value === 'string' && value.trim()) ?? '').trim();
const asObject = (value: unknown): JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : {};
const clamp = (value: unknown, fallback: number, max: number) => Math.max(1, Math.min(Number(value) || fallback, max));
const nowIso = () => new Date().toISOString();
const leaseIso = () => new Date(Date.now() + 2 * 60_000).toISOString();

const toCommandRecord = (row: JsonObject) => ({
  id: String(row.id ?? ''),
  target: 'paper_clip' as const,
  action: String(row.request_type ?? ''),
  context: asObject(asObject(row.evidence_payload).context),
  status: String(row.status ?? 'queued'),
  result: JSON.stringify(row.response_payload ?? {}),
  createdAt: String(row.created_at ?? ''),
  ...(row.completed_at ? { finishedAt: String(row.completed_at) } : {}),
});

const executeAction = async (action: string, context: JsonObject) => {
  const repository = createPlatformRepository('database');
  const service = new PlatformService(repository);
  const client = requireNeonDataClient();
  const companyId = text(context.companyId, context.company_id);

  if (['recompute_company','refresh_monitoring_company','create_task'].includes(action) && !UUID_PATTERN.test(companyId)) {
    throw Object.assign(new Error('companyId is required for this Paperclip action.'), { statusCode: 422 });
  }

  if (action === 'recompute_company') {
    const snapshot = await service.recomputeDerivedData(companyId);
    return {
      companyId,
      qualifications: snapshot.qualifications.length,
      patterns: snapshot.patterns.length,
      scores: snapshot.scoreSnapshots.length,
      leadScores: snapshot.leadScoreSnapshots.length,
    };
  }

  if (action === 'refresh_monitoring_company') {
    return { companyId, ...(await service.refreshMonitoring(companyId)) };
  }

  if (action === 'process_reprocessing_queue') {
    const limit = clamp(context.limit, 10, 25);
    return { limit, rows: await client.rpc('process_origination_reprocessing_queue', { p_limit: limit }) };
  }

  if (action === 'create_task') {
    const title = text(context.title);
    if (!title) throw Object.assign(new Error('title is required for create_task.'), { statusCode: 422 });
    const item = await repository.saveTask({
      companyId,
      title,
      description: text(context.description),
      owner: 'Origination',
      status: 'todo',
      dueDate: text(context.dueDate, context.due_date) || null,
    });
    return { item };
  }

  if (action === 'run_suggested_improvements') {
    const limit = clamp(context.limit, 10, 25);
    const rows = await client.rpc('process_origination_reprocessing_queue', { p_limit: limit });
    return {
      reprocessing: rows,
      autoSend: false,
      note: 'Paperclip executed bounded canonical reprocessing only; no outreach was sent.',
    };
  }

  throw Object.assign(new Error('Unsupported Paperclip action.'), { statusCode: 422 });
};

const existingByIdempotency = async (key: string) => {
  if (!key) return null;
  const rows = await requireNeonDataClient().select('engine_requests', {
    filters: [
      { column: 'target_engine', operator: 'eq', value: 'paper_clip' },
      { column: 'idempotency_key', operator: 'eq', value: key },
    ],
    limit: 1,
  }) as JsonObject[];
  return rows[0] ?? null;
};

const auditRun = async (
  user: PaperclipUser,
  request: JsonObject,
  action: string,
  context: JsonObject,
  output: JsonObject,
) => {
  const companyId = text(context.companyId, context.company_id);
  await requireNeonDataClient().insert('ai_agent_runs', [{
    context_type: companyId ? 'company' : 'global',
    context_id: UUID_PATTERN.test(companyId) ? companyId : null,
    agent_key: `paperclip:${action}`,
    plugins: [],
    input: { requestId: request.id, context },
    output,
    metadata: {
      actor: user.email ?? user.id,
      actorUserId: user.id,
      correlationId: request.correlation_id,
      durableQueue: 'engine_requests',
      autoSend: false,
    },
  }]);
};

export const handlePaperclipControlPlane = async (
  req: IncomingMessage,
  user: PaperclipUser,
): Promise<PaperclipResponse> => {
  const client = requireNeonDataClient();
  const method = (req.method ?? 'GET').toUpperCase();

  if (method === 'GET') {
    const rows = await client.select('engine_requests', {
      filters: [{ column: 'target_engine', operator: 'eq', value: 'paper_clip' }],
      orderBy: { column: 'created_at', ascending: false },
      limit: 25,
    }) as JsonObject[];
    return { statusCode: 200, data: { runtime: 'paperclip-neon-v1', commands: rows.map(toCommandRecord), allowedActions: [...ACTIONS] } };
  }

  if (method !== 'POST') throw Object.assign(new Error('Method not allowed.'), { statusCode: 405 });

  const body = await readJsonBody(req, 128_000);
  const action = text(body.action);
  const context = asObject(body.context);
  if (!ACTIONS.has(action)) throw Object.assign(new Error(`Unsupported Paperclip action: ${action || '<empty>'}.`), { statusCode: 422 });

  const idempotencyKey = text(getHeader(req as IncomingMessage & { headers: Record<string,string|string[]|undefined> }, 'idempotency-key'), body.idempotencyKey) || randomUUID();
  let request = await existingByIdempotency(idempotencyKey);
  const now = new Date();

  if (request) {
    if (request.status === 'completed') return { statusCode: 200, data: toCommandRecord(request) };
    const lease = request.lease_expires_at ? Date.parse(String(request.lease_expires_at)) : 0;
    if (request.status === 'running' && lease > now.getTime()) {
      throw Object.assign(new Error('Paperclip command is already running.'), { statusCode: 409 });
    }
    if (Number(request.attempt_count ?? 0) >= Number(request.max_attempts ?? 3)) {
      throw Object.assign(new Error('Paperclip command exhausted retry attempts.'), { statusCode: 409 });
    }
  } else {
    const companyId = text(context.companyId, context.company_id);
    const inserted = await client.insert('engine_requests', [{
      requester_engine: 'human_ui',
      target_engine: 'paper_clip',
      company_id: UUID_PATTERN.test(companyId) ? companyId : null,
      request_type: action,
      priority: text(body.priority) || 'medium',
      status: 'queued',
      reason: text(body.reason) || 'manual_operator_command',
      evidence_payload: { context },
      response_payload: {},
      idempotency_key: idempotencyKey,
      actor: user.email ?? user.id,
      correlation_id: randomUUID(),
      available_at: nowIso(),
    }]) as JsonObject[];
    request = inserted[0] ?? null;
  }

  if (!request?.id) throw new Error('Paperclip could not persist the engine request.');

  const running = await client.update('engine_requests', {
    status: 'running',
    attempt_count: Number(request.attempt_count ?? 0) + 1,
    leased_at: nowIso(),
    lease_expires_at: leaseIso(),
    last_error: null,
    updated_at: nowIso(),
  }, [{ column: 'id', operator: 'eq', value: String(request.id) }]) as JsonObject[];
  request = running[0] ?? request;

  try {
    const result = asObject(await executeAction(action, context));
    const completedAt = nowIso();
    const done = await client.update('engine_requests', {
      status: 'completed',
      response_payload: result,
      completed_at: completedAt,
      lease_expires_at: null,
      updated_at: completedAt,
    }, [{ column: 'id', operator: 'eq', value: String(request.id) }]) as JsonObject[];
    const completed = done[0] ?? request;
    await auditRun(user, completed, action, context, { status: 'completed', result });
    return { statusCode: 200, data: toCommandRecord(completed) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = nowIso();
    const failed = await client.update('engine_requests', {
      status: 'failed',
      last_error: message,
      response_payload: { error: message },
      lease_expires_at: null,
      available_at: failedAt,
      updated_at: failedAt,
    }, [{ column: 'id', operator: 'eq', value: String(request.id) }]) as JsonObject[];
    await auditRun(user, failed[0] ?? request, action, context, { status: 'failed', error: message }).catch(() => undefined);
    throw error;
  }
};
