import type { SessionData } from './types';
import type {
  OutcomeClaimResult,
  OutcomePriorityBand,
  OutcomeReleaseResult,
  OutcomeRescheduleResult,
  OutcomeSlaItem,
  OutcomeSlaPolicy,
  OutcomeSlaStatus,
  OutcomeSlaSummary,
  OutcomeSlaWorkspace,
  OutcomeOwnershipStatus,
  OutcomeQueueSource,
} from './knowledgeOutcomeSlaTypes';

const env = import.meta.env;
const supabaseUrl = String(env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY ?? '');

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const numberOrZero = (value: unknown) => numberOrNull(value) ?? 0;
const stringOrNull = (value: unknown) => value === null || value === undefined || value === '' ? null : String(value);
const stringArray = (value: unknown) => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
  : [];

const mapItem = (row: Record<string, unknown>): OutcomeSlaItem => ({
  activityId: String(row.activityId ?? ''),
  companyId: String(row.companyId ?? ''),
  companyName: String(row.companyName ?? ''),
  title: String(row.title ?? ''),
  description: stringOrNull(row.description),
  activityType: String(row.activityType ?? 'other'),
  queueSource: String(row.queueSource ?? 'adoption') as OutcomeQueueSource,
  nodeId: stringOrNull(row.nodeId),
  nodeTitle: stringOrNull(row.nodeTitle),
  canAdopt: Boolean(row.canAdopt ?? true),
  priorityScore: numberOrZero(row.priorityScore),
  priorityBand: String(row.priorityBand ?? 'low') as OutcomePriorityBand,
  priorityReasons: stringArray(row.priorityReasons),
  pipelineStage: stringOrNull(row.pipelineStage),
  expectedStructure: stringOrNull(row.expectedStructure),
  ownerName: stringOrNull(row.ownerName),
  taskOwnerUserId: stringOrNull(row.taskOwnerUserId),
  taskOwnerDisplayName: stringOrNull(row.taskOwnerDisplayName),
  assignmentStatus: String(row.assignmentStatus ?? 'unclaimed') as OutcomeOwnershipStatus,
  isMine: Boolean(row.isMine),
  claimedAt: stringOrNull(row.claimedAt),
  slaDueAt: stringOrNull(row.slaDueAt),
  slaStatus: String(row.slaStatus ?? 'unclaimed') as OutcomeSlaStatus,
  slaHoursRemaining: numberOrNull(row.slaHoursRemaining),
  occurredAt: stringOrNull(row.occurredAt),
});

const mapSummary = (value: unknown): OutcomeSlaSummary => {
  const row = Boolean(value) && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    assignedItems: numberOrZero(row.assignedItems),
    unassignedItems: numberOrZero(row.unassignedItems),
    myItems: numberOrZero(row.myItems),
    breachedItems: numberOrZero(row.breachedItems),
    dueSoonItems: numberOrZero(row.dueSoonItems),
  };
};

const mapPolicy = (value: unknown): OutcomeSlaPolicy => {
  const row = Boolean(value) && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    immediateHours: numberOrZero(row.immediateHours),
    highHours: numberOrZero(row.highHours),
    reviewHours: numberOrZero(row.reviewHours),
    lowHours: numberOrZero(row.lowHours),
    basis: String(row.basis ?? 'operational_priority_band'),
  };
};

const rpc = async <T>(
  session: SessionData | null,
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Outcome Workbench requer VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }
  if (!session?.access_token) throw new Error('Sessão autenticada necessária para o Outcome Workbench.');

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) as T | Record<string, unknown> : {};
  if (!response.ok) {
    const error = payload as Record<string, unknown>;
    throw new Error(String(error.message ?? error.details ?? `${functionName} falhou com status ${response.status}.`));
  }
  return payload as T;
};

export const knowledgeOutcomeSlaApi = {
  getWorkspace: async (
    session: SessionData | null,
    companyId?: string,
    days = 365,
  ): Promise<OutcomeSlaWorkspace> => {
    const payload = await rpc<Record<string, unknown>>(session, 'knowledge_outcome_sla_workspace', {
      p_company_id: companyId || null,
      p_days: days,
    });
    return {
      generatedAt: String(payload.generatedAt ?? ''),
      currentUserId: String(payload.currentUserId ?? ''),
      summary: mapSummary(payload.summary),
      myQueue: rows(payload.myQueue).map(mapItem),
      unclaimedQueue: rows(payload.unclaimedQueue).map(mapItem),
      breachedQueue: rows(payload.breachedQueue).map(mapItem),
      dueSoonQueue: rows(payload.dueSoonQueue).map(mapItem),
      slaPolicy: mapPolicy(payload.slaPolicy),
    };
  },

  claim: (
    session: SessionData | null,
    activityId: string,
    idempotencyKey: string,
  ) => rpc<OutcomeClaimResult>(session, 'knowledge_claim_outcome_work_item', {
    p_activity_id: activityId,
    p_idempotency_key: idempotencyKey,
  }),

  release: (
    session: SessionData | null,
    activityId: string,
    idempotencyKey: string,
  ) => rpc<OutcomeReleaseResult>(session, 'knowledge_release_outcome_work_item', {
    p_activity_id: activityId,
    p_idempotency_key: idempotencyKey,
  }),

  reschedule: (
    session: SessionData | null,
    activityId: string,
    slaDueAt: string,
    reason: string,
    idempotencyKey: string,
  ) => rpc<OutcomeRescheduleResult>(session, 'knowledge_reschedule_outcome_sla', {
    p_activity_id: activityId,
    p_sla_due_at: slaDueAt,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  }),
};
