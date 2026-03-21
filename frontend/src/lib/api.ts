import type { ApiEnvelope, CompanyDetail, CompanyListItem, Dashboard, SourceEntry } from './types';
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

export const api = {
  getDashboard: (session: SessionData | null) => request<Dashboard>('/dashboard/summary', session),
  getCompanies: (session: SessionData | null) => request<CompanyListItem[]>('/companies', session),
  getCompany: (session: SessionData | null, id: string) => request<CompanyDetail>(`/companies/${id}`, session),
  getSources: (session: SessionData | null) => request<SourceEntry[]>('/sources/catalog', session),
  recalculateCompany: (session: SessionData | null, id: string) => request(`/companies/${id}/qualification/recalculate`, session, { method: 'POST', body: JSON.stringify({ reason: 'manual_frontend' }) }),
};
