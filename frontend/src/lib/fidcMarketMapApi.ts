import { buildApiUrl } from './runtimeConfig';
import type { DataSourceKind, DataState, SessionData } from './types';

export type FidcMarketMapSort = 'nav_desc' | 'nav_asc' | 'delinquency_desc' | 'subordination_asc' | 'reference_desc' | 'fund_asc';
export type FidcSilenceStatus = 'EM_DIA' | 'DEFASADO' | 'SILENCIO';

export type FidcMarketMapFilters = {
  search?: string;
  manager?: string;
  administrator?: string;
  minNav?: number | null;
  maxNav?: number | null;
  minDelinquencyPct?: number | null;
  maxSubordinationPct?: number | null;
  silenceStatus?: FidcSilenceStatus | '';
  sort?: FidcMarketMapSort;
  page?: number;
  pageSize?: number;
};

export type FidcMarketMapSummary = {
  totalFunds: number;
  fundsWithNav: number;
  totalNav: number;
  medianNav: number | null;
  delinquencyAbove5Pct: number;
  delinquencyAbove10Pct: number;
  subordinationBelow10Pct: number;
  operationalAttention: number;
  unresolvedFunds: number;
  latestReferenceDate: string | null;
  latestObservedAt: string | null;
};

export type FidcMarketMapRow = {
  eventId: string;
  fundCnpj: string | null;
  fundName: string | null;
  referenceDate: string | null;
  deliveredAt: string | null;
  deliveryStatus: string | null;
  nav: number | null;
  portfolio: number | null;
  delinquencyTotal: number | null;
  delinquencyToNav: number | null;
  pdd: number | null;
  subordinationPct: number | null;
  investors: number | null;
  administratorCnpj: string | null;
  administratorName: string | null;
  managerName: string | null;
  custodianName: string | null;
  silenceStatus: FidcSilenceStatus | null;
  monthsWithoutReport: number | null;
  delays12m: number | null;
  refilings12m: number | null;
  currentViolations: number | null;
  companyResolutionStatus: string;
  issuerCompanyId: string | null;
  observedAt: string;
  highDelinquency: boolean;
  lowSubordination: boolean;
  operationalAttention: boolean;
  ratioOutlier: boolean;
};

export type FidcMarketMapSnapshot = {
  source: {
    provider: string;
    sourceCode: string;
    underlyingOfficialSources: string[];
    confidenceCap: number;
    scoreImpact: false;
  };
  filters: Record<string, unknown>;
  universe: FidcMarketMapSummary;
  summary: FidcMarketMapSummary;
  facets: {
    administrators: string[];
    managers: string[];
    silenceStatuses: FidcSilenceStatus[];
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
  rows: FidcMarketMapRow[];
  generatedAt: string;
};

type Envelope = {
  status: DataSourceKind;
  generatedAt?: string;
  data?: FidcMarketMapSnapshot;
  error?: string;
};

const appendNumber = (params: URLSearchParams, key: string, value: number | null | undefined) => {
  if (value !== null && value !== undefined && Number.isFinite(value)) params.set(key, String(value));
};

export async function getFidcMarketMap(
  session: SessionData | null,
  filters: FidcMarketMapFilters,
): Promise<DataState<FidcMarketMapSnapshot>> {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set('q', filters.search.trim());
  if (filters.manager?.trim()) params.set('manager', filters.manager.trim());
  if (filters.administrator?.trim()) params.set('administrator', filters.administrator.trim());
  if (filters.silenceStatus) params.set('silenceStatus', filters.silenceStatus);
  if (filters.sort) params.set('sort', filters.sort);
  appendNumber(params, 'minNav', filters.minNav);
  appendNumber(params, 'maxNav', filters.maxNav);
  appendNumber(params, 'minDelinquencyPct', filters.minDelinquencyPct);
  appendNumber(params, 'maxSubordinationPct', filters.maxSubordinationPct);
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 25));

  const path = `/market-map/fidc?${params.toString()}`;
  const response = await fetch(buildApiUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  const raw = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  if (!raw.trim() || !contentType.includes('application/json')) {
    throw new Error(`Market Map FIDC indisponível. Status ${response.status}.`);
  }

  const payload = JSON.parse(raw) as Envelope;
  if (!response.ok || !payload.data) throw new Error(payload.error ?? `Market Map FIDC falhou com status ${response.status}.`);
  if (payload.data.source.scoreImpact !== false) throw new Error('Contrato inseguro: o Market Map não pode impactar score automaticamente.');

  return {
    source: payload.status,
    note: 'Comparáveis FIDC carregados do Agentetome, com CVM/FNET como fontes oficiais subjacentes e sem impacto automático em score.',
    data: payload.data,
  };
}
