import type {
  AbmObjection,
  AbaCommandRecord,
  AbaStatus,
  AbmStakeholder,
  AbmTouchpoint,
  AbmWeeklyWarRoom,
  AgentsSnapshot,
  ActivityRecord,
  ApiEnvelope,
  CompanyDetail,
  CompanyListItem,
  Dashboard,
  DataState,
  MaisRetornoQuota,
  MonitoringSnapshot,
  MvpQuickActionsSnapshot,
  MvpReadiness,
  OriginationOperatingSystem,
  PipelineSnapshot,
  PipelineStage,
  PipelineRow,
  PreCallBriefing,
  PreMortem,
  SearchProfile,
  SearchProfileCandidate,
  SessionData,
  SourceEntry,
  TaskRecord,
} from './types';
import { fetchWithPolicy, safeResponsePreview } from './http';
import { buildApiUrl } from './runtimeConfig';

const stateNote = (path: string, status: ApiEnvelope<unknown>['status']) => {
  if (status === 'real') return `${path} carregado do backend oficial com Supabase/Auth reais.`;
  if (status === 'partial') return `${path} carregado parcialmente a partir das fontes reais disponíveis; dados ausentes permanecem explícitos.`;
  return `${path} está em modo de demonstração; este estado não deve alimentar decisões de originação.`;
};

const readJsonPayload = async <T>(response: Response, path: string): Promise<ApiEnvelope<T> & { error?: string }> => {
  const raw = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  if (!raw.trim()) return { status: 'partial', data: undefined as T, error: response.ok ? undefined : `${response.status} ${response.statusText || 'Resposta vazia'}` };
  if (!contentType.includes('application/json')) {
    const preview = safeResponsePreview(raw);
    console.warn('[frontend-api] resposta não-JSON', { path, status: response.status, preview });
    throw new Error(`O servidor retornou uma resposta incompatível em ${path}. Tente novamente em instantes.`);
  }
  try { return JSON.parse(raw) as ApiEnvelope<T> & { error?: string }; }
  catch { throw new Error(`O servidor retornou dados inválidos em ${path}. Tente novamente.`); }
};

async function requestEnvelope<T>(path: string, session: SessionData | null, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const url = buildApiUrl(path);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  const response = await fetchWithPolicy(url, { ...init, headers }, { timeoutMs: 25_000, retries: 1 });
  const payload = await readJsonPayload<T>(response, path);
  if (response.status === 401) throw new Error('Sua sessão não foi aceita pelo backend. Atualize a página ou entre novamente.');
  if (!response.ok) throw new Error(payload.error ?? `${path} falhou com status ${response.status}`);
  return payload;
}

export const api = {
  login: async (email: string, password: string) => {
    const response = await fetchWithPolicy(buildApiUrl('/auth/login'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email, password }),
    }, { timeoutMs: 15_000 });
    const payload = await readJsonPayload<SessionData>(response, '/auth/login');
    if (!response.ok) throw new Error(payload.error ?? 'Falha ao autenticar.');
    return payload.data;
  },
  logout: (session: SessionData | null) => requestEnvelope<{ success: boolean }>('/auth/logout', session, { method: 'POST' }),
  getMe: async (session: SessionData | null) => (await requestEnvelope<SessionData['user']>('/auth/me', session)).data,
  getDashboardEnvelope: (session: SessionData | null) => requestEnvelope<Dashboard>('/dashboard/summary', session),
  getDashboard: async (session: SessionData | null) => toState('Dashboard', await requestEnvelope<Dashboard>('/dashboard/summary', session)),
  getCompaniesEnvelope: (session: SessionData | null) => requestEnvelope<CompanyListItem[]>('/companies', session),
  getCompanies: async (session: SessionData | null) => toState('Companies', await requestEnvelope<CompanyListItem[]>('/companies', session)),
  getCompanyEnvelope: (session: SessionData | null, id: string) => requestEnvelope<CompanyDetail>(`/companies/${id}`, session),
  getCompany: async (session: SessionData | null, id: string) => toState('Company detail', await requestEnvelope<CompanyDetail>(`/companies/${id}`, session)),
  getSources: async (session: SessionData | null) => toState('Sources catalog', await requestEnvelope<SourceEntry[]>('/sources/catalog', session)),
  getMaisRetornoQuota: async (session: SessionData | null): Promise<ApiEnvelope<MaisRetornoQuota> | null> => {
    try { return await requestEnvelope<MaisRetornoQuota>('/sources/usage/mais-retorno', session); }
    catch { return null; }
  },
  getSearchProfiles: async (session: SessionData | null) => toState('Search profiles', await requestEnvelope<SearchProfile[]>('/search-profiles', session)),
  saveSearchProfile: async (session: SessionData | null, payload: Omit<SearchProfile, 'id' | 'status' | 'profilePayload'> & { id?: string; status?: 'active' | 'paused'; profilePayload?: Record<string, unknown> }) => (
    await requestEnvelope<SearchProfile>('/search-profiles', session, { method: 'POST', body: JSON.stringify(payload) })
  ).data,
  runSearchProfile: async (session: SessionData | null, profileId: string) => (
    await requestEnvelope<{ run: { profileId: string; profileName: string; runAt: string; candidatesFound: number }; candidates: SearchProfileCandidate[] }>(`/search-profiles/${profileId}/run`, session, { method: 'POST' })
  ).data,
  getSearchProfileCandidates: async (session: SessionData | null, profileId: string) => (await requestEnvelope<SearchProfileCandidate[]>(`/search-profiles/${profileId}/candidates`, session)).data,
  promoteSearchCandidate: async (session: SessionData | null, candidateId: string) => (await requestEnvelope<SearchProfileCandidate>(`/search-profiles/candidates/${candidateId}/promote`, session, { method: 'POST' })).data,
  recalculateCompany: (session: SessionData | null, id: string) => requestEnvelope(`/companies/${id}/qualification/recalculate`, session, { method: 'POST', body: JSON.stringify({ reason: 'manual_frontend' }) }),
  listPipeline: async (session: SessionData | null) => (await requestEnvelope<{ mode: string; rows: PipelineRow[] }>('/pipeline', session)).data.rows,
  getPipelineStages: async (session: SessionData | null) => (await requestEnvelope<{ mode: string; stages: Array<{ stage: string; count: number }> }>('/pipeline/stages', session)).data.stages,
  getPipelineCompany: async (session: SessionData | null, companyId: string) => (await requestEnvelope<{ mode: string; row: PipelineRow | null }>(`/pipeline/company/${companyId}`, session)).data.row,
  movePipelineStage: async (session: SessionData | null, companyId: string, stage: PipelineStage) => (await requestEnvelope<{ mode: string; row: PipelineRow | null }>(`/pipeline/company/${companyId}/move`, session, { method: 'POST', body: JSON.stringify({ stage }) })).data.row,
  updateNextAction: async (session: SessionData | null, companyId: string, nextAction: string) => (await requestEnvelope<{ mode: string; row: PipelineRow | null }>(`/pipeline/company/${companyId}/next-action`, session, { method: 'PATCH', body: JSON.stringify({ nextAction }) })).data.row,
  listActivities: async (session: SessionData | null, companyId?: string) => (await requestEnvelope<{ mode: string; items: ActivityRecord[] }>(companyId ? `/activities/company/${companyId}` : '/activities', session)).data.items,
  createActivity: async (session: SessionData | null, payload: Omit<ActivityRecord, 'id' | 'createdAt' | 'updatedAt'>) => (await requestEnvelope<{ mode: string; item: ActivityRecord }>('/activities', session, { method: 'POST', body: JSON.stringify(payload) })).data.item,
  listTasks: async (session: SessionData | null, companyId?: string) => (await requestEnvelope<{ mode: string; items: TaskRecord[] }>(companyId ? `/tasks/company/${companyId}` : '/tasks', session)).data.items,
  createTask: async (session: SessionData | null, payload: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'>) => (await requestEnvelope<{ mode: string; item: TaskRecord }>('/tasks', session, { method: 'POST', body: JSON.stringify(payload) })).data.item,
  updateTask: async (session: SessionData | null, taskId: string, updates: Partial<Pick<TaskRecord, 'title' | 'description' | 'owner' | 'status' | 'dueDate'>>) => (await requestEnvelope<{ mode: string; item: TaskRecord | null }>(`/tasks/${taskId}`, session, { method: 'PATCH', body: JSON.stringify(updates) })).data.item,

  getMvpQuickActions: async (session: SessionData | null): Promise<DataState<MvpQuickActionsSnapshot>> => {
    const quick = await requestEnvelope<MvpQuickActionsSnapshot>('/mvp/ops/quick-actions', session);
    return { source: quick.status, note: 'Quick actions carregadas exclusivamente do backend oficial; ausência de dados não é preenchida por mocks.', data: quick.data };
  },
  getMvpReadiness: async (session: SessionData | null): Promise<DataState<MvpReadiness>> => toState('MVP readiness', await requestEnvelope<MvpReadiness>('/mvp-readiness', session)),

  getAbmWeekly: (session: SessionData | null) => requestEnvelope<AbmWeeklyWarRoom>('/abm/war-room/weekly', session),
  getAbmStakeholders: (session: SessionData | null, companyId: string) => requestEnvelope<AbmStakeholder[]>(`/abm/companies/${companyId}/stakeholders`, session),
  getAbmTouchpoints: (session: SessionData | null, companyId: string) => requestEnvelope<AbmTouchpoint[]>(`/abm/companies/${companyId}/touchpoints`, session),
  getAbmObjections: (session: SessionData | null, companyId: string) => requestEnvelope<AbmObjection[]>(`/abm/companies/${companyId}/objections`, session),
  getPreCallBriefing: (session: SessionData | null, companyId: string) => requestEnvelope<PreCallBriefing>(`/abm/companies/${companyId}/pre-call-briefing`, session),
  getPreMortem: (session: SessionData | null, companyId: string) => requestEnvelope<PreMortem>(`/abm/companies/${companyId}/pre-mortem`, session),
  recalculateCommercialLayer: (session: SessionData | null, companyId: string) => requestEnvelope(`/abm/companies/${companyId}/recalculate-commercial-layer`, session, { method: 'POST', body: JSON.stringify({ reason: 'manual_frontend' }) }),

  getMonitoringSnapshot: async (session: SessionData | null): Promise<DataState<MonitoringSnapshot>> => {
    const monitoring = await requestEnvelope<MonitoringSnapshot>('/monitoring/snapshot', session);
    return { source: monitoring.status, note: 'Monitoring carregado do endpoint dedicado do backend.', data: monitoring.data };
  },
  getAgentsSnapshot: async (session: SessionData | null): Promise<DataState<AgentsSnapshot>> => {
    const agents = await requestEnvelope<AgentsSnapshot>('/agents/snapshot', session);
    return { source: agents.status, note: 'Agents carregados do snapshot dedicado do backend.', data: agents.data };
  },
  getAbaStatus: async (session: SessionData | null) => toState('ABA status', await requestEnvelope<AbaStatus>('/aba/status', session)),
  commandAba: async (session: SessionData | null, target: 'aba' | 'paper_clip' | 'adm', action: string, context: Record<string, unknown> = {}) => (await requestEnvelope<AbaCommandRecord>('/aba/command', session, { method: 'POST', body: JSON.stringify({ target, action, context }) })).data,
  commandPaperClip: async (session: SessionData | null, action: string, context: Record<string, unknown> = {}) => (await requestEnvelope<AbaCommandRecord>('/agents/paper-clip/command', session, { method: 'POST', body: JSON.stringify({ target: 'paper_clip', action, context }) })).data,
  commandAdm: async (session: SessionData | null, action: string, context: Record<string, unknown> = {}) => (await requestEnvelope<AbaCommandRecord>('/agents/adm/command', session, { method: 'POST', body: JSON.stringify({ action, context }) })).data,
  runAbaAuto: async (session: SessionData | null) => (await requestEnvelope<{ runCount: number; runs: AbaCommandRecord[] }>('/aba/auto-run', session, { method: 'POST', body: JSON.stringify({ target: 'paper_clip', action: 'run_suggested_improvements', context: {} }) })).data,
  getPipelineSnapshot: async (session: SessionData | null): Promise<DataState<PipelineSnapshot>> => {
    const snapshot = await requestEnvelope<{ stages: Array<{ stage: string; count: number }>; recentActivities: Array<{ companyId: string; companyName: string; title: string; owner: string; dueDate: string | null; status: string }> }>('/pipeline/snapshot', session);
    return {
      source: snapshot.status,
      note: 'Pipeline carregado de snapshot agregado do backend.',
      data: {
        stages: snapshot.data.stages.map((stage) => ({ ...stage, note: 'Persistido no CRM' })),
        recentActivities: snapshot.data.recentActivities.slice(0, 8).map((activity) => ({ company: activity.companyName, title: activity.title, owner: activity.owner, when: activity.dueDate ? new Date(activity.dueDate).toLocaleDateString('pt-BR') : '-', status: activity.status })),
      },
    };
  },
  getOriginationOperatingSystem: async (session: SessionData | null): Promise<DataState<OriginationOperatingSystem>> => {
    const os = await requestEnvelope<OriginationOperatingSystem>('/origination/os', session);
    return { source: os.status, note: 'Origination Operating System carregado do backend versionado.', data: os.data };
  },
};

const toState = <T>(path: string, payload: ApiEnvelope<T>): DataState<T> => ({ data: payload.data, source: payload.status, note: stateNote(path, payload.status) });
