import { mockAgentsSnapshot, mockCompanies, mockCompanyDetails, mockDashboard, mockMonitoringSnapshot, mockPipelineSnapshot } from '../mocks/data';
import type { AgentsSnapshot, ApiEnvelope, CompanyDetail, CompanyListItem, Dashboard, DataState, MonitoringSnapshot, PipelineSnapshot, SourceEntry } from './types';
import type { SessionData } from './types';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function request<T>(path: string, session: SessionData | null, init?: RequestInit): Promise<T> {
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
  return payload.data;
}

async function withFallback<T>(loader: () => Promise<T>, fallback: T, realNote: string, mockNote: string): Promise<DataState<T>> {
  try {
    const data = await loader();
    return { data, source: 'real', note: realNote };
  } catch {
    return { data: fallback, source: 'mock', note: mockNote };
  }
}

export const api = {
  getDashboard: (session: SessionData | null) => request<Dashboard>('/dashboard/summary', session),
  getCompanies: (session: SessionData | null) => request<CompanyListItem[]>('/companies', session),
  getCompany: (session: SessionData | null, id: string) => request<CompanyDetail>(`/companies/${id}`, session),
  getSources: (session: SessionData | null) => request<SourceEntry[]>('/sources/catalog', session),
  recalculateCompany: (session: SessionData | null, id: string) => request(`/companies/${id}/qualification/recalculate`, session, { method: 'POST', body: JSON.stringify({ reason: 'manual_frontend' }) }),
  getDashboardWithFallback: (session: SessionData | null) => withFallback(() => request<Dashboard>('/dashboard/summary', session), mockDashboard, 'Dashboard carregado do backend oficial.', 'Dashboard usando fallback centralizado em frontend/src/mocks/data.ts.'),
  getCompaniesWithFallback: (session: SessionData | null) => withFallback(() => request<CompanyListItem[]>('/companies', session), mockCompanies, 'Lista de leads carregada do backend oficial.', 'Lista de leads usando fallback centralizado em frontend/src/mocks/data.ts.'),
  getCompanyWithFallback: (session: SessionData | null, id: string) => withFallback(() => request<CompanyDetail>(`/companies/${id}`, session), mockCompanyDetails[id] ?? mockCompanyDetails[mockCompanies[0].id], 'Company detail carregado do backend oficial.', 'Company detail usando fallback centralizado em frontend/src/mocks/data.ts.'),
  getMonitoringSnapshot: async (session: SessionData | null): Promise<DataState<MonitoringSnapshot>> => {
    try {
      const [dashboard, companies, sources] = await Promise.all([
        request<Dashboard>('/dashboard/summary', session),
        request<CompanyListItem[]>('/companies', session),
        request<SourceEntry[]>('/sources/catalog', session),
      ]);
      return {
        source: 'partial',
        note: 'Monitoring consolidado a partir de dashboard, companies e sources do backend oficial.',
        data: {
          recentTriggers: companies
            .sort((a, b) => b.triggerStrength - a.triggerStrength)
            .slice(0, 4)
            .map((company, index) => ({
              company: company.name,
              signal: company.topPatterns[0] ?? 'Sinal de funding gap identificado',
              source: company.monitoringStatus ?? 'monitoring stack',
              strength: company.triggerStrength,
              when: `${index + 1}h atrás`,
            })),
          latestRuns: dashboard.agents.map((agent) => ({ workflow: agent.name, status: agent.status, detail: agent.note, when: new Date(agent.lastRun).toLocaleString('pt-BR') })),
          activeSources: sources.map((source) => ({ name: source.name, status: source.status, health: source.health, coverage: source.category })),
        },
      };
    } catch {
      return { source: 'mock', note: 'Monitoring usando fallback centralizado em frontend/src/mocks/data.ts.', data: mockMonitoringSnapshot };
    }
  },
  getAgentsSnapshot: async (session: SessionData | null): Promise<DataState<AgentsSnapshot>> => {
    try {
      const dashboard = await request<Dashboard>('/dashboard/summary', session);
      return {
        source: 'partial',
        note: 'Agents consolidados a partir do dashboard oficial.',
        data: {
          items: dashboard.agents.map((agent, index) => ({
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
      const companies = await request<CompanyListItem[]>('/companies', session);
      return {
        source: 'partial',
        note: 'Pipeline consolidado a partir de companies do backend oficial.',
        data: {
          stages: [
            { stage: 'Identified', count: companies.length, note: 'Base total monitorada' },
            { stage: 'Qualified', count: companies.filter((item) => item.qualificationScore >= 70).length, note: 'Qualification >= 70' },
            { stage: 'Approach', count: companies.filter((item) => item.leadScore >= 70).length, note: 'Lead >= 70' },
            { stage: 'Structuring', count: companies.filter((item) => item.suggestedStructure.includes('FIDC')).length, note: 'Mandatos com fit de estrutura' },
          ],
          recentActivities: companies.slice(0, 4).map((company, index) => ({
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
