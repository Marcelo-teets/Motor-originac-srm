import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanySeed } from '../types/platform.js';
import {
  attachCompanyDecisionMetadata,
  evaluateCompanyDecisionEligibility,
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
