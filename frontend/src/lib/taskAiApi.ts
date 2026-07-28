import { buildApiUrl } from './runtimeConfig';
import type { SessionData } from './types';

export type TaskAiProvider = 'auto' | 'openai' | 'anthropic';

export type TaskAiStatus = {
  openai: { configured: boolean; model: string };
  anthropic: { configured: boolean; model: string };
  approvalRequired: boolean;
};

export type PlannedTask = {
  title: string;
  description: string;
  target: 'todo' | 'planner';
  dueDate: string | null;
  importance: 'normal' | 'high';
  bucket: 'Inbox' | 'Esta semana' | 'Em andamento' | 'Aguardando' | 'Concluído';
  rationale: string;
};

export type TaskAiPlan = {
  provider: 'openai' | 'anthropic';
  model: string;
  approvalRequired: boolean;
  plan: {
    summary: string;
    tasks: PlannedTask[];
  };
};

type Envelope<T> = { status: 'real' | 'partial' | 'mock'; generatedAt: string; data: T; error?: string };

const request = async <T>(session: SessionData | null, init?: RequestInit) => {
  const response = await fetch(buildApiUrl('/integrations/task-ai'), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const raw = await response.text();
  let payload: Envelope<T>;
  try {
    payload = JSON.parse(raw) as Envelope<T>;
  } catch {
    throw new Error(`Resposta inválida do assistente de tarefas (${response.status}).`);
  }
  if (!response.ok) throw new Error(payload.error ?? `Assistente de tarefas falhou (${response.status}).`);
  return payload.data;
};

export const taskAiApi = {
  getStatus: (session: SessionData | null) => request<TaskAiStatus>(session),
  plan: (session: SessionData | null, prompt: string, provider: TaskAiProvider) => request<TaskAiPlan>(session, {
    method: 'POST',
    body: JSON.stringify({ prompt, provider }),
  }),
};
