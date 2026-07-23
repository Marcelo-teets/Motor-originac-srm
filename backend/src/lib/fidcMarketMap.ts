import { getSupabaseClient } from './supabase.js';

export const fidcMarketMapSorts = [
  'nav_desc',
  'nav_asc',
  'delinquency_desc',
  'subordination_asc',
  'reference_desc',
  'fund_asc',
] as const;

export type FidcMarketMapSort = typeof fidcMarketMapSorts[number];
export type FidcSilenceStatus = 'EM_DIA' | 'DEFASADO' | 'SILENCIO';

export type FidcMarketMapQuery = {
  search: string | null;
  administrator: string | null;
  manager: string | null;
  minNav: number | null;
  maxNav: number | null;
  minDelinquencyPct: number | null;
  maxSubordinationPct: number | null;
  silenceStatus: FidcSilenceStatus | null;
  sort: FidcMarketMapSort;
  page: number;
  pageSize: number;
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
    provider: 'Agentetome';
    sourceCode: 'src_agentetome_api';
    underlyingOfficialSources: string[];
    confidenceCap: number;
    scoreImpact: false;
  };
  filters: Omit<FidcMarketMapQuery, 'page' | 'pageSize'>;
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

export class FidcMarketMapInputError extends Error {
  readonly statusCode = 400;
}

export class FidcMarketMapUnavailableError extends Error {
  readonly statusCode = 503;
}

const first = (value: unknown) => Array.isArray(value) ? value[0] : value;
const cleanText = (value: unknown, maxLength: number) => {
  const text = String(first(value) ?? '').trim();
  if (!text) return null;
  if (text.length > maxLength) throw new FidcMarketMapInputError(`Filtro excede ${maxLength} caracteres.`);
  return text;
};

const optionalNumber = (value: unknown, label: string, options: { min?: number; max?: number } = {}) => {
  const raw = String(first(value) ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  if (!Number.isFinite(parsed)) throw new FidcMarketMapInputError(`${label} deve ser numérico.`);
  if (options.min !== undefined && parsed < options.min) throw new FidcMarketMapInputError(`${label} deve ser maior ou igual a ${options.min}.`);
  if (options.max !== undefined && parsed > options.max) throw new FidcMarketMapInputError(`${label} deve ser menor ou igual a ${options.max}.`);
  return parsed;
};

const positiveInteger = (value: unknown, label: string, fallback: number, max: number) => {
  const raw = String(first(value) ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new FidcMarketMapInputError(`${label} deve ser um inteiro entre 1 e ${max}.`);
  }
  return parsed;
};

export const parseFidcMarketMapQuery = (query: Record<string, unknown>): FidcMarketMapQuery => {
  const minNav = optionalNumber(query.minNav, 'PL mínimo', { min: 0 });
  const maxNav = optionalNumber(query.maxNav, 'PL máximo', { min: 0 });
  if (minNav !== null && maxNav !== null && minNav > maxNav) {
    throw new FidcMarketMapInputError('PL mínimo não pode superar o PL máximo.');
  }

  const silenceRaw = cleanText(query.silenceStatus, 24)?.toUpperCase() ?? null;
  const silenceStatus = silenceRaw as FidcSilenceStatus | null;
  if (silenceStatus && !['EM_DIA', 'DEFASADO', 'SILENCIO'].includes(silenceStatus)) {
    throw new FidcMarketMapInputError('Status operacional inválido.');
  }

  const sortRaw = cleanText(query.sort, 40) ?? 'nav_desc';
  if (!fidcMarketMapSorts.includes(sortRaw as FidcMarketMapSort)) {
    throw new FidcMarketMapInputError('Ordenação do Market Map inválida.');
  }

  return {
    search: cleanText(query.q ?? query.search, 160),
    administrator: cleanText(query.administrator, 220),
    manager: cleanText(query.manager, 220),
    minNav,
    maxNav,
    minDelinquencyPct: optionalNumber(query.minDelinquencyPct, 'Inadimplência mínima', { min: 0, max: 100 }),
    maxSubordinationPct: optionalNumber(query.maxSubordinationPct, 'Subordinação máxima', { min: 0, max: 100 }),
    silenceStatus,
    sort: sortRaw as FidcMarketMapSort,
    page: positiveInteger(query.page, 'Página', 1, 10_000),
    pageSize: positiveInteger(query.pageSize, 'Itens por página', 25, 100),
  };
};

export const buildFidcMarketMapRpcArgs = (query: FidcMarketMapQuery) => ({
  p_search: query.search,
  p_administrator: query.administrator,
  p_manager: query.manager,
  p_min_nav: query.minNav,
  p_max_nav: query.maxNav,
  p_min_delinquency_pct: query.minDelinquencyPct,
  p_max_subordination_pct: query.maxSubordinationPct,
  p_silence_status: query.silenceStatus,
  p_sort: query.sort,
  p_page: query.page,
  p_page_size: query.pageSize,
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const normalizeFidcMarketMapSnapshot = (value: unknown): FidcMarketMapSnapshot => {
  if (!isRecord(value) || !Array.isArray(value.rows) || !isRecord(value.source) || value.source.scoreImpact !== false) {
    throw new FidcMarketMapUnavailableError('Contrato inválido do Market Map FIDC.');
  }
  return value as FidcMarketMapSnapshot;
};

export async function getFidcMarketMapSnapshot(query: FidcMarketMapQuery): Promise<FidcMarketMapSnapshot> {
  const client = getSupabaseClient();
  if (!client) throw new FidcMarketMapUnavailableError('Supabase não está configurado para o Market Map FIDC.');

  const snapshot = await client.rpc<unknown>('agentetome_fidc_market_map_snapshot', buildFidcMarketMapRpcArgs(query));
  return normalizeFidcMarketMapSnapshot(snapshot);
}
