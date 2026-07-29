import { fetchWithPolicy } from './http';
import { supabaseRuntimeHeaders } from './supabaseRuntime';
import type { SessionData } from './types';
import type { KnowledgeLearningRun, KnowledgeLearningStatus } from './knowledgeLearningTypes';

type RpcError = { message?: string; details?: string; hint?: string };
type RawRun = Omit<KnowledgeLearningRun, 'nodesCreated' | 'nodesUpdated' | 'linksApplied' | 'referencesApplied'> & {
  nodesCreated: number | string;
  nodesUpdated: number | string;
  linksApplied: number | string;
  referencesApplied: number | string;
};
type RawStatus = {
  queue?: Partial<Record<'pending' | 'processing' | 'failed' | 'deadLetter' | 'completed', number | string>>;
  completedToday?: number | string;
  lastRun?: RawRun | null;
  recentRuns?: RawRun[] | null;
};

const rpc = async <T>(session: SessionData | null, name: string, args: Record<string, unknown>): Promise<T> => {
  const { runtime, headers } = supabaseRuntimeHeaders(session, 'Knowledge Learning Agent');
  const response = await fetchWithPolicy(`${runtime.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  }, { timeoutMs: 20_000 });
  const raw = await response.text();
  let payload: T | RpcError | null = null;
  try {
    payload = raw ? JSON.parse(raw) as T | RpcError : null;
  } catch {
    throw new Error(`RPC ${name} retornou uma resposta inválida (${response.status}).`);
  }
  if (!response.ok) {
    const error = payload as RpcError | null;
    throw new Error(error?.message ?? error?.details ?? `RPC ${name} falhou (${response.status}).`);
  }
  return payload as T;
};

const mapRun = (row: RawRun): KnowledgeLearningRun => ({
  ...row,
  nodesCreated: Number(row.nodesCreated ?? 0),
  nodesUpdated: Number(row.nodesUpdated ?? 0),
  linksApplied: Number(row.linksApplied ?? 0),
  referencesApplied: Number(row.referencesApplied ?? 0),
});

export const knowledgeLearningApi = {
  status: async (session: SessionData | null, companyId?: string | null): Promise<KnowledgeLearningStatus> => {
    const row = await rpc<RawStatus>(session, 'knowledge_learning_status', { p_company_id: companyId || null });
    return {
      queue: {
        pending: Number(row.queue?.pending ?? 0),
        processing: Number(row.queue?.processing ?? 0),
        failed: Number(row.queue?.failed ?? 0),
        deadLetter: Number(row.queue?.deadLetter ?? 0),
        completed: Number(row.queue?.completed ?? 0),
      },
      completedToday: Number(row.completedToday ?? 0),
      lastRun: row.lastRun ? mapRun(row.lastRun) : null,
      recentRuns: (row.recentRuns ?? []).map(mapRun),
    };
  },
  enqueue: (session: SessionData | null, companyId: string) => (
    rpc<string>(session, 'knowledge_enqueue_company_learning', { p_company_id: companyId })
  ),
};
