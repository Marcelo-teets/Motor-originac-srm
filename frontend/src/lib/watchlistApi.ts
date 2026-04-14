import type { SessionData } from './types';
import type { WatchList, WatchListItem, WatchListUpdate } from './watchlistTypes';

const apiUrl = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type ApiEnvelope<T> = {
  status: 'real' | 'partial' | 'mock';
  generatedAt?: string;
  data: T;
  error?: string;
};

type DataState<T> = {
  data: T;
  source: 'real' | 'partial' | 'mock';
  note: string;
};

const stateNote = (path: string, status: ApiEnvelope<unknown>['status']) => {
  if (status === 'real') return path + ' carregado do backend oficial.';
  if (status === 'partial') return path + ' carregado parcialmente; backend respondeu com fallback controlado.';
  return path + ' carregado via fallback mock.';
};

async function requestEnvelope<T>(path: string, session: SessionData | null, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await fetch(apiUrl + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}),
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

export const watchlistApi = {
  listWatchLists: async (session: SessionData | null): Promise<DataState<WatchList[]>> =>
    toState('Watch lists', await requestEnvelope<WatchList[]>('/watchlists', session)),

  createWatchList: async (session: SessionData | null, payload: { name: string; description?: string; isShared?: boolean }) =>
    (await requestEnvelope<WatchList>('/watchlists', session, { method: 'POST', body: JSON.stringify(payload) })).data,

  updateWatchList: async (session: SessionData | null, id: string, patch: { name?: string; description?: string; isShared?: boolean }) =>
    (await requestEnvelope<WatchList>('/watchlists/' + id, session, { method: 'PATCH', body: JSON.stringify(patch) })).data,

  deleteWatchList: async (session: SessionData | null, id: string) =>
    (await requestEnvelope<{ deleted: boolean }>('/watchlists/' + id, session, { method: 'DELETE' })).data,

  listWatchListItems: async (session: SessionData | null, watchlistId: string) =>
    (await requestEnvelope<WatchListItem[]>('/watchlists/' + watchlistId + '/items', session)).data,

  addToWatchList: async (session: SessionData | null, watchlistId: string, companyId: string, priorityLabel?: string) =>
    (await requestEnvelope<WatchListItem>('/watchlists/' + watchlistId + '/items', session, {
      method: 'POST',
      body: JSON.stringify({ companyId, priorityLabel }),
    })).data,

  removeFromWatchList: async (session: SessionData | null, watchlistId: string, companyId: string) =>
    (await requestEnvelope<{ removed: boolean }>('/watchlists/' + watchlistId + '/items/' + companyId, session, { method: 'DELETE' })).data,

  getWatchListUpdates: async (session: SessionData | null, watchlistId: string) =>
    (await requestEnvelope<WatchListUpdate[]>('/watchlists/' + watchlistId + '/updates', session)).data,

  getCompanyWatchLists: async (session: SessionData | null, companyId: string) =>
    (await requestEnvelope<WatchList[]>('/watchlists/company/' + companyId, session)).data,
};
