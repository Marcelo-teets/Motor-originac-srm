import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanySeed } from '../types/platform.js';
import {
  attachCompanyDecisionMetadata,
  type DecisionAwareCompany,
  evaluateCompanyDecisionEligibility,
  isCompanyApprovedForCreditDerivation,
  isCompanyDecisionEligible,
  isCompanyEntityEligible,
  isCompanyMonitoringEligible,
  markCompanyAsDemoSeed,
} from './companyDecisionEligibility.js';

const baseCompany = (): CompanySeed => ({
  id: 'company-test',
  legalName: 'Empresa Teste Ltda.',
  tradeName: 'Empresa Teste',
  cnpj: '12345678000199',
  website: 'https://example.com',
  geography: 'Brasil',
  segment: 'Fintech',
  subsegment: 'Recebíveis',
  companyType: 'Growth',
  stage: 'Scale-up',
  creditProduct: 'Antecipação',
  receivables: ['Duplicatas'],
  currentFundingStructure: 'Linhas bilaterais',
  description: 'Empresa de teste.',
  signals: [],
  monitoring: {
    status: 'queued',
    lastRunAt: '',
    outputs24h: 0,
    triggers24h: 0,
    websiteChanges: [],
    feedHighlights: [],
  },
  enrichment: {
    governanceMaturity: 'medium',
    underwritingMaturity: 'medium',
    operationalMaturity: 'medium',
    riskModelMaturity: 'medium',
    unitEconomicsQuality: 'mixed',
    spreadVsFundingQuality: 'neutral',
    concentrationRisk: 'medium',
    delinquencySignal: 'low',
    sourceConfidence: 0.5,
    sourceNotes: [],
  },
  sourceRecords: [],
  marketMapPeers: [],
  activities: [],
});

test('demo seed is excluded from every runtime gate', () => {
  const company = markCompanyAsDemoSeed(baseCompany());
  const result = evaluateCompanyDecisionEligibility(company);
  assert.equal(result.eligible, false);
  assert.equal(result.dataStatus, 'mock');
  assert.equal(result.reason, 'synthetic_demo_seed');
  assert.equal(isCompanyEntityEligible(company), false);
  assert.equal(isCompanyMonitoringEligible(company), false);
});

test('identity-approved company may be monitored without becoming a decision lead', () => {
  const company = attachCompanyDecisionMetadata(baseCompany(), {
    data_status: 'real',
    identity_review_status: 'approved',
    identity_verified: true,
    entity_resolution_eligible: true,
    monitoring_eligible: true,
    decision_eligible: false,
    excluded_from_qualification: true,
    excluded_from_scoring: true,
    decision_eligibility_reason: 'identity_only_pending_credit_review',
  });
  assert.equal(isCompanyEntityEligible(company), true);
  assert.equal(isCompanyMonitoringEligible(company), true);
  assert.equal(evaluateCompanyDecisionEligibility(company).eligible, false);
  assert.equal(evaluateCompanyDecisionEligibility(company).reason, 'identity_only_pending_credit_review');
});

test('decision eligibility requires identity and explicit credit approval', () => {
  const incomplete = attachCompanyDecisionMetadata(baseCompany(), {
    data_status: 'real',
    decision_eligible: true,
  });
  assert.equal(evaluateCompanyDecisionEligibility(incomplete).eligible, false);

  const approved = attachCompanyDecisionMetadata(baseCompany(), {
    data_status: 'real',
    identity_review_status: 'approved',
    identity_verified: true,
    entity_resolution_eligible: true,
    monitoring_eligible: true,
    decision_eligible: true,
    excluded_from_qualification: false,
    excluded_from_scoring: false,
    decision_eligibility_reason: 'credit_evidence_review_approved',
  });
  assert.equal(isCompanyEntityEligible(approved), true);
  assert.equal(isCompanyMonitoringEligible(approved), true);
  assert.equal(evaluateCompanyDecisionEligibility(approved).eligible, true);
  assert.equal(evaluateCompanyDecisionEligibility(approved).reason, 'credit_evidence_review_approved');
});

test('qualification or scoring exclusions override an approval', () => {
  const company = attachCompanyDecisionMetadata(baseCompany(), {
    data_status: 'real',
    identity_review_status: 'approved',
    identity_verified: true,
    entity_resolution_eligible: true,
    monitoring_eligible: true,
    decision_eligible: true,
    excluded_from_scoring: true,
    decision_eligibility_reason: 'manual_hold',
  });
  const result = evaluateCompanyDecisionEligibility(company);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'manual_hold');
});

test('capture scoring requires an identifiable approved human credit review beyond decision_eligible flag', () => {
  const metadata = {
    data_status: 'real',
    identity_review_status: 'approved',
    identity_verified: true,
    decision_eligible: true,
    excluded_from_scoring: false,
    excluded_from_qualification: false,
  };
  const flagOnly = attachCompanyDecisionMetadata(baseCompany(), metadata);
  assert.equal(isCompanyDecisionEligible(flagOnly), true);
  assert.equal(isCompanyApprovedForCreditDerivation(flagOnly), false);

  const valid = attachCompanyDecisionMetadata(baseCompany(), {
    ...metadata,
    credit_review_id: 'human-review-123',
    credit_review_status: 'approved',
    qualification_status: 'eligible',
    credit_review_evidence: [{ url: 'https://example.org/source' }],
  });
  assert.equal(isCompanyApprovedForCreditDerivation(valid), true);

  for (const patch of [
    { credit_review_status: 'rejected' },
    { qualification_status: 'monitor_only' },
    { credit_review_id: '' },
    { decision_eligible: false },
    { data_status: 'mock' },
  ]) {
    const blocked = attachCompanyDecisionMetadata(baseCompany(), {
      ...metadata,
      credit_review_id: 'human-review-123',
      credit_review_status: 'approved',
      qualification_status: 'eligible',
      ...patch,
    });
    assert.equal(isCompanyApprovedForCreditDerivation(blocked), false, JSON.stringify(patch));
  }
});

test('unreviewed or null credit fields remain unknown rather than false or zero', () => {
  const company = attachCompanyDecisionMetadata(baseCompany(), {
    data_status: 'real',
    identity_review_status: 'approved',
    decision_eligible: true,
    credit_review_id: 'human-review-nullables',
    credit_review_status: 'approved',
    qualification_status: 'eligible',
    credit_is_core: null,
    credit_review_has_receivables: 'unknown',
    receivables_structurable: '',
    credit_review_has_fidc: undefined,
    credit_review_uses_structured_debt: null,
    credit_review_fit_fidc: null,
    credit_review_fit_dcm: 'pending',
    credit_review_structural_score: null,
    credit_review_capital_score: '',
    credit_review_receivables_score: false,
    credit_review_execution_score: 'not_assessed',
    credit_review_timing_score: undefined,
    credit_review_confidence: ' ',
  }) as DecisionAwareCompany;

  assert.equal(isCompanyApprovedForCreditDerivation(company), true);
  assert.ok(company.creditReview);
  for (const field of [
    'creditIsCore', 'hasReceivables', 'receivablesStructurable', 'hasFidc',
    'usesStructuredDebt', 'fitFidc', 'fitDcm', 'structuralScore',
    'capitalScore', 'receivablesScore', 'executionScore', 'timingScore', 'confidence',
  ] as const) {
    assert.equal(company.creditReview?.[field], undefined, field);
  }
});

test('explicit negative answers and legitimate zero scores survive credit review mapping', () => {
  const company = attachCompanyDecisionMetadata(baseCompany(), {
    data_status: 'real',
    identity_review_status: 'approved',
    decision_eligible: true,
    credit_review_id: 'human-review-zeroes',
    credit_review_status: 'approved',
    qualification_status: 'eligible',
    credit_is_core: false,
    credit_review_has_receivables: 'false',
    receivables_structurable: true,
    credit_review_has_fidc: 'true',
    credit_review_uses_structured_debt: false,
    credit_review_fit_fidc: 'false',
    credit_review_fit_dcm: true,
    credit_review_structural_score: 0,
    credit_review_capital_score: '0',
    credit_review_receivables_score: 25,
    credit_review_execution_score: '42',
    credit_review_timing_score: 0,
    credit_review_confidence: '0',
  }) as DecisionAwareCompany;

  assert.deepEqual({
    creditIsCore: company.creditReview?.creditIsCore,
    hasReceivables: company.creditReview?.hasReceivables,
    receivablesStructurable: company.creditReview?.receivablesStructurable,
    hasFidc: company.creditReview?.hasFidc,
    usesStructuredDebt: company.creditReview?.usesStructuredDebt,
    fitFidc: company.creditReview?.fitFidc,
    fitDcm: company.creditReview?.fitDcm,
  }, {
    creditIsCore: false,
    hasReceivables: false,
    receivablesStructurable: true,
    hasFidc: true,
    usesStructuredDebt: false,
    fitFidc: false,
    fitDcm: true,
  });
  assert.deepEqual([
    company.creditReview?.structuralScore,
    company.creditReview?.capitalScore,
    company.creditReview?.receivablesScore,
    company.creditReview?.executionScore,
    company.creditReview?.timingScore,
    company.creditReview?.confidence,
  ], [0, 0, 25, 42, 0, 0]);
});
