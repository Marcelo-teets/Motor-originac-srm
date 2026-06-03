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

type MonitoringOutputRow = {
  id: string;
  companyId?: string;
  sourceId: string;
  title: string;
  summary: string;
  collectedAt: string;
  confidenceScore: number;
  connectorStatus: string;
  normalizedPayload?: Record<string, unknown>;
};

type SourceHealthSnapshot = {
  summary: {
    totalSources: number;
    healthySources: number;
    degradedSources: number;
    downSources: number;
    activeSources: number;
    totalOutputs: number;
    realOutputs: number;
    partialOutputs: number;
    officialSourcesObserved: number;
  };
  sources: Array<SourceEntry & {
    outputCount: number;
    realOutputCount: number;
    partialOutputCount: number;
    averageConfidence: number;
    lastOutputAt: string | null;
    lastOutputTitle: string | null;
    lastOutputStatus: string | null;
    isOfficial: boolean;
    decision: string;
    nextAction: string;
  }>;
};

const stateNote = (path: string, status: ApiEnvelope<unknown>['status']) => {
  if (status === 'real') return `${path} carregado do backend oficial com Supabase/Auth reais.`;
  if (status === 'partial') return `${path} carregado parcialmente; backend priorizou DB real e completou com fallback controlado.`;
  return `${path} carregado via fallback mock.`;
};

async function requestEnvelope<T>(path: string, session: SessionData | null, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json() as ApiEnvelope<T> & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Request failed');
  return payload;
}

const toState = <T>(path: string, payload: ApiEnvelope<T>): DataState<T> => ({
  data: payload.data,
  source: payload.status,
  note: stateNote(path, payload.status),
});

const isOfficialSource = (source: SourceEntry) => /cvm|bcb|ifdata|pncp|receita|anbima|fidc|central_bank|procurement|government/i.test(
  `${source.id} ${source.name} ${source.sourceType} ${source.category}`,
);

const sourceDecision = (source: SourceEntry, outputs: MonitoringOutputRow[], isOfficial: boolean) => {
  if (source.health === 'down') return { decision: 'Fonte indisponível', nextAction: 'Revisar adapter, URL ou credencial antes de usar no score.' };
  if (source.status === 'planned') return { decision: 'Planejada', nextAction: 'Priorizar implementação somente se melhorar originação real.' };
  if (!outputs.length) return { decision: 'Sem evidência recente', nextAction: isOfficial ? 'Rodar captura oficial e validar persistência no Supabase.' : 'Rodar captura e checar se há match por empresa.' };
  const partialCount = outputs.filter((item) => item.connectorStatus !== 'real').length;
  if (partialCount > outputs.length / 2) return { decision: 'Atenção', nextAction: 'Investigar conectores parciais e payloads de erro.' };
  return { decision: 'Operacional', nextAction: 'Usar evidências em qualification, patterns e ranking.' };
};

const buildSourceHealthSnapshot = (sources: SourceEntry[], outputs: MonitoringOutputRow[]): SourceHealthSnapshot => {
  const rows = sources.map((source) => {
    const sourceOutputs = outputs
      .filter((output) => output.sourceId === source.id)
      .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
    const realOutputCount = sourceOutputs.filter((output) => output.connectorStatus === 'real').length;
    const partialOutputCount = sourceOutputs.length - realOutputCount;
    const averageConfidence = sourceOutputs.length
      ? Math.round((sourceOutputs.reduce((sum, output) => sum + Number(output.confidenceScore ?? 0), 0) / sourceOutputs.length) * 100)
      : 0;
    const isOfficial = isOfficialSource(source);
    const { decision, nextAction } = sourceDecision(source, sourceOutputs, isOfficial);

    return {
      ...source,
      outputCount: sourceOutputs.length,
      realOutputCount,
      partialOutputCount,
      averageConfidence,
      lastOutputAt: sourceOutputs[0]?.collectedAt ?? null,
      lastOutputTitle: sourceOutputs[0]?.title ?? null,
      lastOutputStatus: sourceOutputs[0]?.connectorStatus ?? null,
      isOfficial,
      decision,
      nextAction,
    };
  }).sort((a, b) => {
    if (Number(b.isOfficial) !== Number(a.isOfficial)) return Number(b.isOfficial) - Number(a.isOfficial);
    if (b.outputCount !== a.outputCount) return b.outputCount - a.outputCount;
    return a.name.localeCompare(b.name);
  });

  return {
    summary: {
      totalSources: sources.length,
      healthySources: sources.filter((source) => source.health === 'healthy').length,
      degradedSources: sources.filter((source) => source.health === 'degraded').length,
      downSources: sources.filter((source) => source.health === 'down').length,
      activeSources: sources.filter((source) => source.status === 'real').length,
      totalOutputs: outputs.length,
      realOutputs: outputs.filter((output) => output.connectorStatus === 'real').length,
      partialOutputs: outputs.filter((output) => output.connectorStatus !== 'real').length,
      officialSourcesObserved: rows.filter((source) => source.isOfficial && source.outputCount > 0).length,
    },
    sources: rows,
  };
};

export const api = {
  login: async (email: string, password: string) => {
    const response = await fetch(buildApiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json() as ApiEnvelope<SessionData> & { error?: string };
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
  getSourceHealthSnapshot: async (session: SessionData | null): Promise<DataState<SourceHealthSnapshot>> => {
    const [sources, outputs] = await Promise.all([
      requestEnvelope<SourceEntry[]>('/sources/catalog', session),
      requestEnvelope<MonitoringOutputRow[]>('/monitoring/outputs', session),
    ]);
    const status = sources.status === 'real' && outputs.status === 'real' ? 'real' : sources.status === 'mock' || outputs.status === 'mock' ? 'mock' : 'partial';
    return {
      source: status,
      note: status === 'real'
        ? 'Sources health calculado a partir do source_catalog e monitoring_outputs persistidos.'
        : 'Sources health calculado com dados parciais; validar Supabase e captura antes de usar como métrica executiva.',
      data: buildSourceHealthSnapshot(sources.data, outputs.data),
    };
  },
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
        note: 'Quick actions usando fallback sintético até a tela ser conectada ao backend oficial.',
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