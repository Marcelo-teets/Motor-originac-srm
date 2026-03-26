import { mockAgentsSnapshot, mockMonitoringSnapshot, mockPipelineSnapshot } from '../mocks/data';
import type {
  AbmObjection,
  AbmStakeholder,
  AbmTouchpoint,
  AbmWeeklyWarRoom,
  AgentsSnapshot,
  ApiEnvelope,
  CompanyDetail,
  CompanyListItem,
  Dashboard,
  DataState,
  MonitoringSnapshot,
  MvpQuickActionsSnapshot,
  PipelineSnapshot,
  PreCallBriefing,
  PreMortem,
  SearchProfile,
  SessionData,
  SourceEntry,
} from './types';

const apiUrl = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const stateNote = (path: string, status: ApiEnvelope<unknown>['status']) => {
  if (status === 'real') return `${path} carregado do backend oficial com Supabase/Auth reais.`;
  if (status === 'partial') return `${path} carregado parcialmente; backend priorizou DB real e completou com fallback controlado.`;
  return `${path} carregado via fallback mock.`;
};

async function requestEnvelope<T>(path: string, session: SessionData | null, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${apiUrl}${path}`, {
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

export const api = {
  login: async (email: string, password: string) => {
    const response = await fetch(`${apiUrl}/auth/login`, {
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
  getSearchProfiles: async (session: SessionData | null) => toState('Search profiles', await requestEnvelope<SearchProfile[]>('/search-profiles', session)),
  saveSearchProfile: async (session: SessionData | null, payload: Omit<SearchProfile, 'id' | 'status' | 'profilePayload'> & { id?: string; status?: 'active' | 'paused'; profilePayload?: Record<string, unknown> }) => (
    await requestEnvelope<SearchProfile>('/search-profiles', session, { method: 'POST', body: JSON.stringify(payload) })
  ).data,
  recalculateCompany: (session: SessionData | null, id: string) => requestEnvelope(`/companies/${id}/qualification/recalculate`, session, { method: 'POST', body: JSON.stringify({ reason: 'manual_frontend' }) }),

  getMvpQuickActions: async (session: SessionData | null): Promise<DataState<MvpQuickActionsSnapshot>> => {
    try {
      const [dashboard, companies] = await Promise.all([
        requestEnvelope<Dashboard>('/dashboard/summary', session),
        requestEnvelope<CompanyListItem[]>('/companies', session),
      ]);

      const highestLead = [...companies.data].sort((a, b) => b.leadScore - a.leadScore)[0];
      const highestUrgency = [...companies.data].sort((a, b) => (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0))[0];

      return {
        source: dashboard.status === 'real' && companies.status === 'real' ? 'real' : 'partial',
        note: 'Quick actions montadas a partir de dashboard e companies do backend oficial.',
        data: {
          items: [
            {
              id: 'qa_top_lead',
              title: highestLead ? `Abordar ${highestLead.name}` : 'Revisar top lead',
              owner: 'Origination',
              priority: 'high',
            },
            {
              id: 'qa_monitoring',
              title: `Rodar monitoring prioritário (${dashboard.data.monitoring.outputs24h} outputs)`,
              owner: 'Intelligence',
              priority: 'medium',
            },
            {
              id: 'qa_urgent_company',
              title: highestUrgency ? `Validar timing de ${highestUrgency.name}` : 'Validar timing comercial',
              owner: 'Coverage',
              priority: 'high',
            },
            {
              id: 'qa_pipeline',
              title: 'Atualizar pipeline comercial',
              owner: 'Origination',
              priority: 'medium',
            },
          ],
        },
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

  getAbmWeekly: (session: SessionData | null) => requestEnvelope<AbmWeeklyWarRoom>('/abm/war-room/weekly', session),
  getAbmStakeholders: (session: SessionData | null, companyId: string) => requestEnvelope<AbmStakeholder[]>(`/abm/companies/${companyId}/stakeholders`, session),
  getAbmTouchpoints: (session: SessionData | null, companyId: string) => requestEnvelope<AbmTouchpoint[]>(`/abm/companies/${companyId}/touchpoints`, session),
  getAbmObjections: (session: SessionData | null, companyId: string) => requestEnvelope<AbmObjection[]>(`/abm/companies/${companyId}/objections`, session),
  getPreCallBriefing: (session: SessionData | null, companyId: string) => requestEnvelope<PreCallBriefing>(`/abm/companies/${companyId}/pre-call-briefing`, session),
  getPreMortem: (session: SessionData | null, companyId: string) => requestEnvelope<PreMortem>(`/abm/companies/${companyId}/pre-mortem`, session),
  recalculateCommercialLayer: (session: SessionData | null, companyId: string) => requestEnvelope(`/abm/companies/${companyId}/recalculate-commercial-layer`, session, { method: 'POST', body: JSON.stringify({ reason: 'manual_frontend' }) }),

  getMonitoringSnapshot: async (session: SessionData | null): Promise<DataState<MonitoringSnapshot>> => {
    try {
      const [dashboard, companies, sources] = await Promise.all([
        requestEnvelope<Dashboard>('/dashboard/summary', session),
        requestEnvelope<CompanyListItem[]>('/companies', session),
        requestEnvelope<SourceEntry[]>('/sources/catalog', session),
      ]);
      return {
        source: dashboard.status === 'real' && companies.status === 'real' ? 'partial' : dashboard.status,
        note: 'Monitoring consolidado a partir de dashboard, companies e sources do backend oficial.',
        data: {
          recentTriggers: companies.data
            .sort((a, b) => b.triggerStrength - a.triggerStrength)
            .slice(0, 4)
            .map((company, index) => ({
              company: company.name,
              signal: company.topPatterns[0] ?? 'Sinal de funding gap identificado',
              source: company.monitoringStatus ?? 'monitoring stack',
              strength: company.triggerStrength,
              when: `${index + 1}h atrás`,
            })),
          latestRuns: dashboard.data.agents.map((agent) => ({ workflow: agent.name, status: agent.status, detail: agent.note, when: new Date(agent.lastRun).toLocaleString('pt-BR') })),
          activeSources: sources.data.map((source) => ({ name: source.name, status: source.status, health: source.health, coverage: source.category })),
        },
      };
    } catch {
      return { source: 'mock', note: 'Monitoring usando fallback centralizado em frontend/src/mocks/data.ts.', data: mockMonitoringSnapshot };
    }
  },
  getAgentsSnapshot: async (session: SessionData | null): Promise<DataState<AgentsSnapshot>> => {
    try {
      const dashboard = await requestEnvelope<Dashboard>('/dashboard/summary', session);
      return {
        source: 'partial',
        note: 'Agents consolidados a partir do dashboard oficial.',
        data: {
          items: dashboard.data.agents.map((agent, index) => ({
            name: agent.name,
            status: agent.status,
            failures: agent.status === 'real' ? 0 : 1,
            confidence: Math.max(58, 88 - index * 6),
            focus: agent.note,
            updatedAt: new Date(agent.lastRun).toLocaleString('pt-BR'),
          })),
        },
      };
    } catch {
      return { source: 'mock', note: 'Agents usando fallback centralizado em frontend/src/mocks/data.ts.', data: mockAgentsSnapshot };
    }
  },
  getPipelineSnapshot: async (session: SessionData | null): Promise<DataState<PipelineSnapshot>> => {
    try {
      const companies = await requestEnvelope<CompanyListItem[]>('/companies', session);
      return {
        source: 'partial',
        note: 'Pipeline consolidado a partir de companies do backend oficial.',
        data: {
          stages: [
            { stage: 'Identified', count: companies.data.length, note: 'Base total monitorada' },
            { stage: 'Qualified', count: companies.data.filter((item) => item.qualificationScore >= 70).length, note: 'Qualification >= 70' },
            { stage: 'Approach', count: companies.data.filter((item) => item.leadScore >= 70).length, note: 'Lead >= 70' },
            { stage: 'Structuring', count: companies.data.filter((item) => item.suggestedStructure.includes('FIDC')).length, note: 'Mandatos com fit de estrutura' },
          ],
          recentActivities: companies.data.slice(0, 4).map((company, index) => ({
            company: company.name,
            title: company.nextAction ?? 'Executar contato executivo',
            owner: index % 2 === 0 ? 'Origination' : 'Coverage',
            when: `${index + 1}d`,
            status: company.leadScore >= 80 ? 'prioritário' : 'em andamento',
          })),
        },
      };
    } catch {
      return { source: 'mock', note: 'Pipeline usando fallback centralizado em frontend/src/mocks/data.ts.', data: mockPipelineSnapshot };
    }
  },
};
