import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanySeed } from '../types/platform.js';
import {
  attachCompanyDecisionMetadata,
  evaluateCompanyDecisionEligibility,
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

test('demo seed is never decision eligible', () => {
  const company = markCompanyAsDemoSeed(baseCompany());
  const result = evaluateCompanyDecisionEligibility(company);
  assert.equal(result.eligible, false);
  assert.equal(result.dataStatus, 'mock');
  assert.equal(result.reason, 'synthetic_demo_seed');
});

test('real company requires explicit approval', () => {
  const partial = attachCompanyDecisionMetadata(baseCompany(), { data_status: 'real' });
  assert.equal(evaluateCompanyDecisionEligibility(partial).eligible, false);
  assert.equal(evaluateCompanyDecisionEligibility(partial).reason, 'data_status_real');

  const approved = attachCompanyDecisionMetadata(baseCompany(), {
    data_status: 'real',
    decision_eligible: true,
    decision_eligibility_reason: 'evidence_review_approved',
  });
  assert.equal(evaluateCompanyDecisionEligibility(approved).eligible, true);
  assert.equal(evaluateCompanyDecisionEligibility(approved).reason, 'evidence_review_approved');
});

test('exclusion flags override an approval', () => {
  const company = attachCompanyDecisionMetadata(baseCompany(), {
    data_status: 'real',
    decision_eligible: true,
    excluded_from_scoring: true,
    decision_eligibility_reason: 'manual_hold',
  });
  const result = evaluateCompanyDecisionEligibility(company);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'manual_hold');
});
