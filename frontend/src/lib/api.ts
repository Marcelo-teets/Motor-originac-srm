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
import { buildApiUrl } from './runtimeConfig';

export type ApiErrorPayload = {
  statusCode?: number;
  code?: string;
  error?: string;
  message?: string;
  requestId?: string;
  details?: unknown;
};

export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(message: string, options: { statusCode: number; code: string; requestId?: string; details?: unknown }) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

const stateNote = (path: string, status: ApiEnvelope<unknown>['status']) => {
  if (status === 'real') return `${path} carregado do backend oficial com Supabase/Auth reais.`;
  if (status === 'partial') return `${path} carregado parcialmente; backend priorizou DB real e completou com fallback controlado.`;
  return `${path} carregado via fallback mock.`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const field = (payload: unknown, key: string) => (isRecord(payload) ? payload[key] : undefined);
const isApiStatus = (value: unknown): value is ApiEnvelope<unknown>['status'] =>
  value === 'real' || value === 'partial' || value === 'mock';
const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const requestHeaders = (session: SessionData | null, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  return headers;
};

const payloadWithHeaderRequestId = (payload: unknown, requestId: string | undefined) => {
  if (!isRecord(payload) || !requestId || typeof payload.requestId === 'string') return payload;
  return { ...payload, requestId };
};

const readPayload = async <T>(response: Response, path: string): Promise<ApiEnvelope<T> | ApiErrorPayload> => {
  const headerRequestId = response.headers.get('x-request-id') ?? undefined;
  const raw = await response.text();

  if (!raw.trim()) {
    return {
      statusCode: response.status,
      code: 'empty_response',
      error: response.ok ? `${path} returned an empty response.` : `${response.status} ${response.statusText || 'Empty response'}`,
      requestId: headerRequestId,
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {
        statusCode: response.status,
        code: 'unexpected_response_shape',
        error: `${path} returned a non-object JSON response.`,
        requestId: headerRequestId,
        details: { bodyType: typeof parsed },
      };
    }
    return payloadWithHeaderRequestId(parsed, headerRequestId) as ApiEnvelope<T> | ApiErrorPayload;
  } catch {
    return {
      statusCode: response.status,
      code: 'invalid_json_response',
      error: `Resposta nao-JSON em ${path}.`,
      requestId: headerRequestId,
      details: {
        contentType: response.headers.get('content-type'),
        bodyPreview: normalizeWhitespace(raw).slice(0, 180),
      },
    };
  }
};

const isApiEnvelope = <T>(payload: unknown): payload is ApiEnvelope<T> =>
  isRecord(payload) && isApiStatus(payload.status) && 'data' in payload;

const toClientError = (response: Response, path: string, payload: ApiErrorPayload | ApiEnvelope<unknown>) => {
  const message = asString(field(payload, 'error')) ?? asString(field(payload, 'message')) ?? `${path} falhou com status ${response.status}`;
  return new ApiClientError(message, {
    statusCode: asNumber(field(payload, 'statusCode')) ?? response.status,
    code: asString(field(payload, 'code')) ?? 'request_failed',
    requestId: asString(field(payload, 'requestId')) ?? response.headers.get('x-request-id') ?? undefined,
    details: field(payload, 'details'),
  });
};

async function requestEnvelope<T>(path: string, session: SessionData | null, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const url = buildApiUrl(path);
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: requestHeaders(session, init),
    });
  } catch (error) {
    throw new ApiClientError(`Falha de rede ao acessar ${path}: ${error instanceof Error ? error.message : 'backend indisponivel'}`, {
      statusCode: 0,
      code: 'network_error',
    });
  }

  const payload = await readPayload<T>(response, path);
  if (!response.ok) throw toClientError(response, path, payload);
  if (!isApiEnvelope<T>(payload)) {
    throw new ApiClientError(`${path} retornou um envelope invalido da API.`, {
      statusCode: response.status,
      code: asString(field(payload, 'code')) ?? 'invalid_api_envelope',
      requestId: asString(field(payload, 'requestId')) ?? response.headers.get('x-request-id') ?? undefined,
      details: field(payload, 'details'),
    });
  }
  return payload;
}

const toState = <T>(path: string, payload: ApiEnvelope<T>): DataState<T> => ({
  data: payload.data,
  source: payload.status,
  note: stateNote(path, payload.status),
});

export const api = {
  login: async (email: string, password: string) => (
    await requestEnvelope<SessionData>('/auth/login', null, { method: 'POST', body: JSON.stringify({ email, password }) })
  ).data,
  logout: (session: SessionData | null) => requestEnvelope<{ success: boolean }>('/auth/logout', session, { method: 'POST' }),
  getMe: async (session: SessionData | null) => (await requestEnvelope<SessionData['user']>('/auth/me', session)).data,

  getDashboardEnvelope: (session: SessionData | null) => requestEnvelope<Dashboard>('/dashboard/summary', session),
  getDashboard: async (session: SessionData | null) => toState('Dashboard', await requestEnvelope<Dashboard>('/dashboard/summary', session)),
  getCompaniesEnvelope: (session: SessionData | null) => requestEnvelope<CompanyListItem[]>('/companies', session),
  getCompanies: async (session: SessionData | null) => toState('Companies', await requestEnvelope<CompanyListItem[]>('/companies', session)),
  getCompanyEnvelope: (session: SessionData | null, id: string) => requestEnvelope<CompanyDetail>(`/companies/${id}`, session),
  getCompany: async (session: SessionData | null, id: string) => toState('Company detail', await requestEnvelope<CompanyDetail>(`/companies/${id}`, session)),
  getSources: async (session: SessionData | null) => toState('Sources catalog', await requestEnvelope<SourceEntry[]>('/sources/catalog', session)),
  getSearchProfiles: async (session: SessionData | null) => toState('Search profiles', await requestEnvelope<SearchProfile[]>('/search-profiles', session)),
  saveSearchProfile: async (session: SessionData | null, payload: Omit<SearchProfile, 'id' | 'status' | 'profilePayload'> & { id?: string; status?: 'active' | 'paused'; profilePayload?: Record<string, unknown> }) => (
    await requestEnvelope<SearchProfile>('/search-profiles', session, { method: 'POST', body: JSON.stringify(payload) })
  ).data,
  runSearchProfile: async (session: SessionData | null, profileId: string) => (
    await requestEnvelope<{ run: { profileId: string; profileName: string; runAt: string; candidatesFound: number }; candidates: SearchProfileCandidate[] }>(`/search-profiles/${profileId}/run`, session, { method: 'POST' })
  ).data,
  getSearchProfileCandidates: async (session: SessionData | null, profileId: string) => (
    await requestEnvelope<SearchProfileCandidate[]>(`/search-profiles/${profileId}/candidates`, session)
  ).data,
  promoteSearchCandidate: async (session: SessionData | null, candidateId: string) => (
    await requestEnvelope<SearchProfileCandidate>(`/search-profiles/candidates/${candidateId}/promote`, session, { method: 'POST' })
  ).data,
  recalculateCompany: (session: SessionData | null, id: string) => requestEnvelope(`/companies/${id}/qualification/recalculate`, session, { method: 'POST', body: JSON.stringify({ reason: 'manual_frontend' }) }),
  listPipeline: async (session: SessionData | null) => (await requestEnvelope<{ mode: string; rows: PipelineRow[] }>('/pipeline', session)).data.rows,
  getPipelineStages: async (session: SessionData | null) => (await requestEnvelope<{ mode: string; stages: Array<{ stage: string; count: number }> }>('/pipeline/stages', session)).data.stages,
  getPipelineCompany: async (session: SessionData | null, companyId: string) => (await requestEnvelope<{ mode: string; row: PipelineRow | null }>(`/pipeline/company/${companyId}`, session)).data.row,
  movePipelineStage: async (session: SessionData | null, companyId: string, stage: PipelineStage) => (
    await requestEnvelope<{ mode: string; row: PipelineRow | null }>(`/pipeline/company/${companyId}/move`, session, { method: 'POST', body: JSON.stringify({ stage }) })
  ).data.row,
  updateNextAction: async (session: SessionData | null, companyId: string, nextAction: string) => (
    await requestEnvelope<{ mode: string; row: PipelineRow | null }>(`/pipeline/company/${companyId}/next-action`, session, { method: 'PATCH', body: JSON.stringify({ nextAction }) })
  ).data.row,
  listActivities: async (session: SessionData | null, companyId?: string) => (
    await requestEnvelope<{ mode: string; items: ActivityRecord[] }>(companyId ? `/activities/company/${companyId}` : '/activities', session)
  ).data.items,
  createActivity: async (session: SessionData | null, payload: Omit<ActivityRecord, 'id' | 'createdAt' | 'updatedAt'>) => (
    await requestEnvelope<{ mode: string; item: ActivityRecord }>('/activities', session, { method: 'POST', body: JSON.stringify(payload) })
  ).data.item,
  listTasks: async (session: SessionData | null, companyId?: string) => (
    await requestEnvelope<{ mode: string; items: TaskRecord[] }>(companyId ? `/tasks/company/${companyId}` : '/tasks', session)
  ).data.items,
  createTask: async (session: SessionData | null, payload: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'>) => (
    await requestEnvelope<{ mode: string; item: TaskRecord }>('/tasks', session, { method: 'POST', body: JSON.stringify(payload) })
  ).data.item,
  updateTask: async (session: SessionData | null, taskId: string, updates: Partial<Pick<TaskRecord, 'title' | 'description' | 'owner' | 'status' | 'dueDate'>>) => (
    await requestEnvelope<{ mode: string; item: TaskRecord | null }>(`/tasks/${taskId}`, session, { method: 'PATCH', body: JSON.stringify(updates) })
  ).data.item,

  getMvpQuickActions: async (session: SessionData | null): Promise<DataState<MvpQuickActionsSnapshot>> => {
    try {
      const quick = await requestEnvelope<MvpQuickActionsSnapshot>('/mvp/ops/quick-actions', session);
      return {
        source: quick.status,
        note: 'Quick actions carregadas do backend.',
        data: quick.data,
      };
    } catch {
      return {
        source: 'mock',
        note: 'Quick actions usando fallback sintetico ate a tela ser conectada ao backend oficial.',
        data: {
          items: [
            { id: 'qa_mock_1', title: 'Revisar ranking', owner: 'Origination', priority: 'high' },
            { id: 'qa_mock_2', title: 'Abrir monitoring', owner: 'Intelligence', priority: 'medium' },
          ],
        },
      };
    }
  },
  getMvpReadiness: async (session: SessionData | null): Promise<DataState<MvpReadiness>> => (
    toState('MVP readiness', await requestEnvelope<MvpReadiness>('/mvp-readiness', session))
  ),

  getAbmWeekly: (session: SessionData | null) => requestEnvelope<AbmWeeklyWarRoom>('/abm/war-room/weekly', session),
  getAbmStakeholders: (session: SessionData | null, companyId: string) => requestEnvelope<AbmStakeholder[]>(`/abm/companies/${companyId}/stakeholders`, session),
  getAbmTouchpoints: (session: SessionData | null, companyId: string) => requestEnvelope<AbmTouchpoint[]>(`/abm/companies/${companyId}/touchpoints`, session),
  getAbmObjections: (session: SessionData | null, companyId: string) => requestEnvelope<AbmObjection[]>(`/abm/companies/${companyId}/objections`, session),
  getPreCallBriefing: (session: SessionData | null, companyId: string) => requestEnvelope<PreCallBriefing>(`/abm/companies/${companyId}/pre-call-briefing`, session),
  getPreMortem: (session: SessionData | null, companyId: string) => requestEnvelope<PreMortem>(`/abm/companies/${companyId}/pre-mortem`, session),
  recalculateCommercialLayer: (session: SessionData | null, companyId: string) => requestEnvelope(`/abm/companies/${companyId}/recalculate-commercial-layer`, session, { method: 'POST', body: JSON.stringify({ reason: 'manual_frontend' }) }),

  getMonitoringSnapshot: async (session: SessionData | null): Promise<DataState<MonitoringSnapshot>> => {
    const monitoring = await requestEnvelope<MonitoringSnapshot>('/monitoring/snapshot', session);
    return {
      source: monitoring.status,
      note: 'Monitoring carregado do endpoint dedicado do backend.',
      data: monitoring.data,
    };
  },
  getAgentsSnapshot: async (session: SessionData | null): Promise<DataState<AgentsSnapshot>> => {
    const agents = await requestEnvelope<AgentsSnapshot>('/agents/snapshot', session);
    return {
      source: agents.status,
      note: 'Agents carregados do snapshot dedicado do backend.',
      data: agents.data,
    };
  },
  getAbaStatus: async (session: SessionData | null) => toState('ABA status', await requestEnvelope<AbaStatus>('/aba/status', session)),
  commandAba: async (session: SessionData | null, target: 'aba' | 'paper_clip' | 'adm', action: string, context: Record<string, unknown> = {}) => (
    await requestEnvelope<AbaCommandRecord>('/aba/command', session, { method: 'POST', body: JSON.stringify({ target, action, context }) })
  ).data,
  commandPaperClip: async (session: SessionData | null, action: string, context: Record<string, unknown> = {}) => (
    await requestEnvelope<AbaCommandRecord>('/agents/paper-clip/command', session, { method: 'POST', body: JSON.stringify({ action, context }) })
  ).data,
  commandAdm: async (session: SessionData | null, action: string, context: Record<string, unknown> = {}) => (
    await requestEnvelope<AbaCommandRecord>('/agents/adm/command', session, { method: 'POST', body: JSON.stringify({ action, context }) })
  ).data,
  runAbaAuto: async (session: SessionData | null) => (
    await requestEnvelope<{ runCount: number; runs: AbaCommandRecord[] }>('/aba/auto-run', session, { method: 'POST' })
  ).data,
  getPipelineSnapshot: async (session: SessionData | null): Promise<DataState<PipelineSnapshot>> => {
    const snapshot = await requestEnvelope<{
      stages: Array<{ stage: string; count: number }>;
      recentActivities: Array<{ companyId: string; companyName: string; title: string; owner: string; dueDate: string | null; status: string }>;
    }>('/pipeline/snapshot', session);
    return {
      source: snapshot.status,
      note: 'Pipeline carregado de snapshot agregado do backend.',
      data: {
        stages: snapshot.data.stages.map((stage) => ({ ...stage, note: 'Persistido no CRM' })),
        recentActivities: snapshot.data.recentActivities.slice(0, 8).map((activity) => ({
          company: activity.companyName,
          title: activity.title,
          owner: activity.owner,
          when: activity.dueDate ? new Date(activity.dueDate).toLocaleDateString('pt-BR') : '-',
          status: activity.status,
        })),
      },
    };
  },
  getOriginationOperatingSystem: async (session: SessionData | null): Promise<DataState<OriginationOperatingSystem>> => {
    const os = await requestEnvelope<OriginationOperatingSystem>('/origination/os', session);
    return {
      source: os.status,
      note: 'Origination Operating System carregado do backend versionado.',
      data: os.data,
    };
  },
};
