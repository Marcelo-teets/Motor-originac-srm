import { fetchWithPolicy } from './http';
import { buildApiUrl } from './runtimeConfig';
import type { SessionData } from './types';

export type MicrosoftConnectionStatus = {
  configured: boolean;
  missingConfig: string[];
  connected: boolean;
  connection: null | {
    status: 'active' | 'error' | 'disconnected';
    accountEmail?: string | null;
    displayName?: string | null;
    tenantId?: string | null;
    todoListId?: string | null;
    plannerPlanId?: string | null;
    plannerGroupId?: string | null;
    plannerBuckets: Record<string, string>;
    lastSyncAt?: string | null;
    lastError?: string | null;
    grantedScopes: string[];
  };
};

export type TodoTask = {
  id: string;
  title: string;
  status?: string;
  importance?: string;
  dueDateTime?: { dateTime?: string; timeZone?: string } | null;
  body?: { content?: string; contentType?: string } | null;
};

export type PlannerTask = {
  id: string;
  title: string;
  planId?: string;
  bucketId?: string;
  percentComplete?: number;
  dueDateTime?: string | null;
};

export type PlannerBucket = { id: string; name: string; planId?: string };

export type MicrosoftWorkspace = {
  todo: {
    listId: string;
    lists: Array<{ id: string; displayName: string; isOwner?: boolean; wellknownListName?: string }>;
    tasks: TodoTask[];
  };
  planner: {
    enabled: boolean;
    reason?: string;
    planId?: string;
    groupId?: string;
    buckets: PlannerBucket[];
    tasks: PlannerTask[];
  };
};

type Envelope<T> = { status: 'real' | 'partial' | 'mock'; generatedAt: string; data: T; error?: string };

const request = async <T>(operation: string, session: SessionData | null, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  const response = await fetchWithPolicy(buildApiUrl(`/integrations/microsoft/${operation}`), {
    ...init,
    headers,
  }, { timeoutMs: operation === 'sync' || operation === 'bootstrap' ? 28_000 : 20_000, retries: 1 });
  const raw = await response.text();
  let payload: Envelope<T>;
  try {
    payload = JSON.parse(raw) as Envelope<T>;
  } catch {
    throw new Error(`Resposta inválida da integração Microsoft (${response.status}).`);
  }
  if (!response.ok) throw new Error(payload.error ?? `Integração Microsoft falhou (${response.status}).`);
  return payload.data;
};

export const microsoftApi = {
  getStatus: (session: SessionData | null) => request<MicrosoftConnectionStatus>('status', session),
  getWorkspace: (session: SessionData | null) => request<MicrosoftWorkspace>('workspace', session),
  connect: (session: SessionData | null) => request<{ authorizationUrl: string }>('connect', session, { method: 'POST' }),
  bootstrap: (session: SessionData | null, groupId?: string) => request<Record<string, unknown>>('bootstrap', session, {
    method: 'POST',
    body: JSON.stringify(groupId ? { groupId } : {}),
  }),
  sync: (session: SessionData | null) => request<{ todoItemsRead: number; plannerItemsRead: number; linksWritten: number; plannerEnabled: boolean }>('sync', session, { method: 'POST' }),
  disconnect: (session: SessionData | null) => request<{ disconnected: boolean }>('disconnect', session, { method: 'DELETE' }),
  createTask: (session: SessionData | null, payload: {
    target: 'todo' | 'planner';
    title: string;
    description?: string;
    dueDate?: string;
    importance?: 'normal' | 'high';
    bucket?: string;
    groupId?: string;
  }) => request<{ target: 'todo' | 'planner'; task: TodoTask | PlannerTask }>('create-task', session, {
    method: 'POST', body: JSON.stringify(payload),
  }),
};
