import { fetchWithPolicy } from './http';
import { buildApiUrl } from './runtimeConfig';
import type { DataSourceKind, DataState, SessionData } from './types';

export type CompanyDecisionReadiness = {
  status: 'ready' | 'blocked_no_real_companies';
  gateOpen: boolean;
  qualityGateVersion: number;
  companyMaster: { totalCompanies: number; eligibleCompanies: number; demoCompanies: number; unapprovedCompanies: number; eligibleCompanyIds: string[] };
  quality: { openCompanyViolations: number; latestQualityEventAt: string | null; writeGuardsActive: boolean };
  historicalExcludedRows: { qualificationSnapshots: number; leadScoreSnapshots: number; scoreSnapshots: number; companyPatterns: number; rankingRows: number; pipelineRows: number; thesisOutputs: number };
  candidateQueue: { total: number; withCnpj: number; captured: number; review: number; promoted: number; latestCaptureAt: string | null };
  publicEvidence: { records: number; linkedRecords: number; unlinkedRecords: number; distinctCnpjs: number; latestObservedAt: string | null };
  policy: { historicalRowsVisibleForAudit: boolean; historicalRowsVisibleAsCurrentLeads: false; automaticPromotion: false; requiresCnpjReconciliation: true; requiresEvidenceReview: true };
  nextActions: Array<{ code: string; label: string; route: string; priority: number }>;
  generatedAt: string;
};

type Envelope = { status: DataSourceKind; data?: CompanyDecisionReadiness; error?: string };

type CacheEntry = {
  token: string;
  expiresAt: number;
  value: DataState<CompanyDecisionReadiness>;
};

let cache: CacheEntry | null = null;
let inflight: { token: string; request: Promise<DataState<CompanyDecisionReadiness>> } | null = null;
const CACHE_TTL_MS = 30_000;

async function loadCompanyDecisionReadiness(session: SessionData | null): Promise<DataState<CompanyDecisionReadiness>> {
  const response = await fetchWithPolicy(buildApiUrl('/company-decision-readiness'), {
    headers: {
      Accept: 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  }, { timeoutMs: 15_000, retries: 1 });
  const raw = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  if (!raw.trim() || !contentType.includes('application/json')) throw new Error(`Company Master gate indisponível. Status ${response.status}.`);

  let payload: Envelope;
  try {
    payload = JSON.parse(raw) as Envelope;
  } catch {
    throw new Error('Company Master gate retornou dados inválidos.');
  }

  if (!response.ok || !payload.data) throw new Error(payload.error ?? `Company Master gate falhou com status ${response.status}.`);
  if (payload.data.policy.historicalRowsVisibleAsCurrentLeads !== false || payload.data.policy.automaticPromotion !== false) {
    throw new Error('Contrato inseguro do Company Master: histórico ou promoção automática foram habilitados.');
  }
  return {
    source: payload.status,
    note: 'Quality gate real: somente empresas com identidade reconciliada e aprovação explícita podem aparecer como leads atuais.',
    data: payload.data,
  };
}

export async function getCompanyDecisionReadiness(session: SessionData | null): Promise<DataState<CompanyDecisionReadiness>> {
  const token = String(session?.access_token ?? 'anonymous');
  if (cache?.token === token && cache.expiresAt > Date.now()) return cache.value;
  if (inflight?.token === token) return inflight.request;

  const request = loadCompanyDecisionReadiness(session)
    .then((value) => {
      cache = { token, expiresAt: Date.now() + CACHE_TTL_MS, value };
      return value;
    })
    .finally(() => {
      if (inflight?.request === request) inflight = null;
    });

  inflight = { token, request };
  return request;
}
