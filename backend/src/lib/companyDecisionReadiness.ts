import { getSupabaseClient } from './supabase.js';

export type CompanyDecisionReadinessStatus = 'ready' | 'blocked_no_real_companies';

export type CompanyDecisionReadiness = {
  status: CompanyDecisionReadinessStatus;
  gateOpen: boolean;
  qualityGateVersion: number;
  companyMaster: {
    totalCompanies: number;
    eligibleCompanies: number;
    demoCompanies: number;
    unapprovedCompanies: number;
    eligibleCompanyIds: string[];
  };
  quality: {
    openCompanyViolations: number;
    latestQualityEventAt: string | null;
    writeGuardsActive: boolean;
  };
  historicalExcludedRows: {
    qualificationSnapshots: number;
    leadScoreSnapshots: number;
    scoreSnapshots: number;
    companyPatterns: number;
    rankingRows: number;
    pipelineRows: number;
    thesisOutputs: number;
  };
  candidateQueue: {
    total: number;
    withCnpj: number;
    captured: number;
    review: number;
    promoted: number;
    latestCaptureAt: string | null;
  };
  publicEvidence: {
    records: number;
    linkedRecords: number;
    unlinkedRecords: number;
    distinctCnpjs: number;
    latestObservedAt: string | null;
  };
  policy: {
    historicalRowsVisibleForAudit: boolean;
    historicalRowsVisibleAsCurrentLeads: false;
    automaticPromotion: false;
    requiresCnpjReconciliation: true;
    requiresEvidenceReview: true;
  };
  nextActions: Array<{
    code: string;
    label: string;
    route: string;
    priority: number;
  }>;
  generatedAt: string;
};

export class CompanyDecisionReadinessUnavailableError extends Error {
  readonly statusCode = 503;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalizeCompanyDecisionReadiness(value: unknown): CompanyDecisionReadiness {
  if (!isRecord(value) || !isRecord(value.companyMaster) || !isRecord(value.policy) || !Array.isArray(value.nextActions)) {
    throw new CompanyDecisionReadinessUnavailableError('Contrato inválido de prontidão do Company Master.');
  }
  if (value.policy.historicalRowsVisibleAsCurrentLeads !== false || value.policy.automaticPromotion !== false) {
    throw new CompanyDecisionReadinessUnavailableError('Contrato inseguro: histórico ou promoção automática não podem alimentar leads atuais.');
  }
  const eligibleIds = value.companyMaster.eligibleCompanyIds;
  if (!Array.isArray(eligibleIds)) {
    throw new CompanyDecisionReadinessUnavailableError('Contrato inválido: eligibleCompanyIds ausente.');
  }
  return value as CompanyDecisionReadiness;
}

export async function getCompanyDecisionReadiness(): Promise<CompanyDecisionReadiness> {
  const client = getSupabaseClient();
  if (!client) throw new CompanyDecisionReadinessUnavailableError('Supabase não está configurado para o Company Master quality gate.');
  const snapshot = await client.rpc<unknown>('company_decision_readiness_snapshot', {});
  return normalizeCompanyDecisionReadiness(snapshot);
}
