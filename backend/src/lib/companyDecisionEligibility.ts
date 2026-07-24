import type { CompanySeed } from '../types/platform.js';

export type CompanyDataStatus = 'real' | 'partial' | 'mock';

export type ApprovedCompanyCreditReview = {
  reviewId?: string;
  reviewVersion?: number;
  status?: string;
  outcome?: 'eligible' | 'monitor_only' | 'ineligible';
  creditProductType?: string;
  creditIsCore?: boolean;
  hasReceivables?: boolean;
  receivablesStructurable?: boolean;
  receivablesType?: string[];
  receivablesRecurrenceLevel?: string;
  receivablesPredictabilityLevel?: string;
  hasFidc?: boolean;
  usesStructuredDebt?: boolean;
  fundingStructureType?: string;
  capitalStructureQuality?: string;
  fundingGapLevel?: string;
  fitFidc?: boolean;
  fitDcm?: boolean;
  timingLevel?: string;
  suggestedStructure?: string;
  structuralScore?: number;
  capitalScore?: number;
  receivablesScore?: number;
  executionScore?: number;
  timingScore?: number;
  confidence?: number;
  rationale?: string;
  nextAction?: string;
  evidence?: unknown[];
};

export type CompanyDecisionMetadata = {
  dataStatus?: CompanyDataStatus;
  identityVerified?: boolean;
  entityResolutionEligible?: boolean;
  monitoringEligible?: boolean;
  decisionEligible?: boolean;
  decisionEligibilityReason?: string;
  creditReview?: ApprovedCompanyCreditReview;
};

export type DecisionAwareCompany = CompanySeed & CompanyDecisionMetadata;

export type CompanyDecisionEligibility = {
  eligible: boolean;
  dataStatus: CompanyDataStatus;
  reason: string;
};

const asDataStatus = (value: unknown): CompanyDataStatus => {
  if (value === 'real' || value === 'mock') return value;
  return 'partial';
};

const asBoolean = (value: unknown) => value === true || value === 'true';
const asNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const asText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const asStringArray = (value: unknown) => Array.isArray(value)
  ? value.map((item) => String(item).trim()).filter(Boolean)
  : [];

const asApprovedCreditReview = (source: Record<string, unknown>): ApprovedCompanyCreditReview | undefined => {
  const status = asText(source.credit_review_status);
  const outcome = asText(source.qualification_status);
  if (!status || !['approved', 'rejected'].includes(status)) return undefined;

  return {
    reviewId: asText(source.credit_review_id),
    reviewVersion: asNumber(source.credit_review_version),
    status,
    outcome: outcome === 'eligible' || outcome === 'monitor_only' || outcome === 'ineligible' ? outcome : undefined,
    creditProductType: asText(source.credit_product_type),
    creditIsCore: source.credit_is_core === undefined ? undefined : asBoolean(source.credit_is_core),
    hasReceivables: source.credit_review_has_receivables === undefined ? undefined : asBoolean(source.credit_review_has_receivables),
    receivablesStructurable: source.receivables_structurable === undefined ? undefined : asBoolean(source.receivables_structurable),
    receivablesType: asStringArray(source.receivables_type),
    receivablesRecurrenceLevel: asText(source.receivables_recurrence_level),
    receivablesPredictabilityLevel: asText(source.receivables_predictability_level),
    hasFidc: source.credit_review_has_fidc === undefined ? undefined : asBoolean(source.credit_review_has_fidc),
    usesStructuredDebt: source.credit_review_uses_structured_debt === undefined ? undefined : asBoolean(source.credit_review_uses_structured_debt),
    fundingStructureType: asText(source.credit_review_funding_structure_type),
    capitalStructureQuality: asText(source.capital_structure_quality),
    fundingGapLevel: asText(source.funding_gap_level),
    fitFidc: source.credit_review_fit_fidc === undefined ? undefined : asBoolean(source.credit_review_fit_fidc),
    fitDcm: source.credit_review_fit_dcm === undefined ? undefined : asBoolean(source.credit_review_fit_dcm),
    timingLevel: asText(source.timing_level),
    suggestedStructure: asText(source.suggested_structure),
    structuralScore: asNumber(source.credit_review_structural_score),
    capitalScore: asNumber(source.credit_review_capital_score),
    receivablesScore: asNumber(source.credit_review_receivables_score),
    executionScore: asNumber(source.credit_review_execution_score),
    timingScore: asNumber(source.credit_review_timing_score),
    confidence: asNumber(source.credit_review_confidence),
    rationale: asText(source.credit_review_rationale),
    nextAction: asText(source.credit_review_next_action),
    evidence: Array.isArray(source.credit_review_evidence) ? source.credit_review_evidence : undefined,
  };
};

export function evaluateCompanyDecisionEligibility(company: CompanySeed): CompanyDecisionEligibility {
  const decisionCompany = company as DecisionAwareCompany;
  const dataStatus = asDataStatus(decisionCompany.dataStatus);

  if (decisionCompany.decisionEligible === false) {
    return {
      eligible: false,
      dataStatus,
      reason: decisionCompany.decisionEligibilityReason ?? 'explicitly_excluded',
    };
  }

  if (dataStatus !== 'real') {
    return {
      eligible: false,
      dataStatus,
      reason: decisionCompany.decisionEligibilityReason ?? `data_status_${dataStatus}`,
    };
  }

  if (decisionCompany.decisionEligible !== true) {
    return {
      eligible: false,
      dataStatus,
      reason: decisionCompany.decisionEligibilityReason ?? 'decision_eligibility_not_approved',
    };
  }

  return {
    eligible: true,
    dataStatus,
    reason: decisionCompany.decisionEligibilityReason ?? 'approved_real_company',
  };
}

export const isCompanyDecisionEligible = (company: CompanySeed) => evaluateCompanyDecisionEligibility(company).eligible;

export const isCompanyEntityEligible = (company: CompanySeed) => {
  const current = company as DecisionAwareCompany;
  return current.dataStatus === 'real'
    && current.identityVerified === true
    && current.entityResolutionEligible === true;
};

export const isCompanyMonitoringEligible = (company: CompanySeed) => {
  const current = company as DecisionAwareCompany;
  return isCompanyEntityEligible(company) && current.monitoringEligible === true;
};

export const markCompanyAsDemoSeed = (company: CompanySeed): CompanySeed => ({
  ...company,
  dataStatus: 'mock',
  identityVerified: false,
  entityResolutionEligible: false,
  monitoringEligible: false,
  decisionEligible: false,
  decisionEligibilityReason: 'synthetic_demo_seed',
} as DecisionAwareCompany);

export const attachCompanyDecisionMetadata = (
  company: CompanySeed,
  metadata: Record<string, unknown> | null | undefined,
): CompanySeed => {
  const source = metadata ?? {};
  const syntheticSeed = asBoolean(source.synthetic_seed);
  const excludedFromEntityResolution = asBoolean(source.excluded_from_entity_resolution);
  const excludedFromMonitoring = asBoolean(source.excluded_from_monitoring);
  const excludedFromQualification = asBoolean(source.excluded_from_qualification);
  const excludedFromScoring = asBoolean(source.excluded_from_scoring);
  const dataStatus = asDataStatus(source.data_status);
  const identityVerified = asBoolean(source.identity_verified) || source.identity_review_status === 'approved';
  const entityResolutionEligible = dataStatus === 'real'
    && identityVerified
    && !syntheticSeed
    && !excludedFromEntityResolution;
  const monitoringEligible = entityResolutionEligible
    && asBoolean(source.monitoring_eligible)
    && !excludedFromMonitoring;
  const approved = asBoolean(source.decision_eligible);
  const creditReview = asApprovedCreditReview(source);
  const reviewedReceivables = creditReview?.receivablesType ?? [];

  return {
    ...company,
    creditProduct: creditReview?.creditProductType ?? company.creditProduct,
    receivables: reviewedReceivables.length ? reviewedReceivables : company.receivables,
    currentFundingStructure: creditReview?.fundingStructureType ?? company.currentFundingStructure,
    dataStatus,
    identityVerified,
    entityResolutionEligible,
    monitoringEligible,
    decisionEligible: approved
      && entityResolutionEligible
      && !excludedFromQualification
      && !excludedFromScoring,
    decisionEligibilityReason: String(
      source.decision_eligibility_reason
        ?? (syntheticSeed
          ? 'synthetic_demo_seed'
          : approved
            ? 'approved_real_company'
            : identityVerified
              ? 'identity_only_pending_credit_review'
              : `data_status_${dataStatus}`),
    ),
    creditReview,
  } as DecisionAwareCompany;
};
