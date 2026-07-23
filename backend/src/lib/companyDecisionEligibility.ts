import type { CompanySeed } from '../types/platform.js';

export type CompanyDataStatus = 'real' | 'partial' | 'mock';

export type CompanyDecisionMetadata = {
  dataStatus?: CompanyDataStatus;
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

export const markCompanyAsDemoSeed = (company: CompanySeed): CompanySeed => ({
  ...company,
  dataStatus: 'mock',
  decisionEligible: false,
  decisionEligibilityReason: 'synthetic_demo_seed',
} as DecisionAwareCompany);

export const attachCompanyDecisionMetadata = (
  company: CompanySeed,
  metadata: Record<string, unknown> | null | undefined,
): CompanySeed => {
  const source = metadata ?? {};
  const syntheticSeed = asBoolean(source.synthetic_seed);
  const explicitlyExcluded = [
    source.excluded_from_entity_resolution,
    source.excluded_from_monitoring,
    source.excluded_from_qualification,
    source.excluded_from_scoring,
  ].some(asBoolean);
  const dataStatus = asDataStatus(source.data_status);
  const approved = asBoolean(source.decision_eligible);

  return {
    ...company,
    dataStatus,
    decisionEligible: approved && !syntheticSeed && !explicitlyExcluded,
    decisionEligibilityReason: String(
      source.decision_eligibility_reason
        ?? (syntheticSeed ? 'synthetic_demo_seed' : approved ? 'approved_real_company' : `data_status_${dataStatus}`),
    ),
  } as DecisionAwareCompany;
};
