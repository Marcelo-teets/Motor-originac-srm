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

export async function getCompanyDecisionReadiness(session: SessionData | null): Promise<DataState<CompanyDecisionReadiness>> {
  const response = await fetch(buildApiUrl('/company-decision-readiness'), {
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  const raw = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  if (!raw.trim() || !contentType.includes('application/json')) throw new Error(`Company Master gate indisponível. Status ${response.status}.`);
  const payload = JSON.parse(raw) as Envelope;
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
