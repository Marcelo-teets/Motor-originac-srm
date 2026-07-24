import type { CompanySeed } from '../types/platform.js';

export type CompanyDataStatus = 'real' | 'partial' | 'mock';

export type CompanyDecisionMetadata = {
  dataStatus?: CompanyDataStatus;
  identityVerified?: boolean;
  entityResolutionEligible?: boolean;
  monitoringEligible?: boolean;
  decisionEligible?: boolean;
  decisionEligibilityReason?: string;
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

  return {
    ...company,
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
  } as DecisionAwareCompany;
};
