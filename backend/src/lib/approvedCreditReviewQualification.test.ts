import assert from 'node:assert/strict';
import test from 'node:test';
import type { DecisionAwareCompany } from './companyDecisionEligibility.js';
import { buildApprovedCreditReviewQualification } from './approvedCreditReviewQualification.js';

const company: DecisionAwareCompany = {
  id: 'fdac3e35-1d23-41d1-a9fd-0376445d3992',
  legalName: 'Creditas Soluções Ltda.',
  tradeName: 'Creditas',
  cnpj: '17770708000124',
  website: 'https://creditas.com',
  geography: 'Brasil',
  segment: 'Fintech',
  subsegment: 'Crédito com garantia',
  companyType: 'originadora de crédito',
  stage: 'Qualified',
  creditProduct: 'Home Equity e Auto Finance',
  receivables: ['Carteira Home Equity', 'Carteira Auto Finance'],
  currentFundingStructure: 'FIDCs, CRIs, FIIs e linhas bilaterais',
  description: 'Fintech de crédito com garantia.',
  signals: [],
  monitoring: {
    status: 'active',
    lastRunAt: '2026-07-24T00:00:00Z',
    outputs24h: 0,
    triggers24h: 0,
    websiteChanges: [],
    feedHighlights: [],
  },
  enrichment: {
    governanceMaturity: 'high',
    underwritingMaturity: 'high',
    operationalMaturity: 'high',
    riskModelMaturity: 'high',
    unitEconomicsQuality: 'positive',
    spreadVsFundingQuality: 'healthy',
    concentrationRisk: 'medium',
    delinquencySignal: 'low',
    sourceConfidence: 0.93,
    sourceNotes: [],
  },
  sourceRecords: [],
  marketMapPeers: [],
  activities: [],
  dataStatus: 'real',
  identityVerified: true,
  entityResolutionEligible: true,
  monitoringEligible: true,
  decisionEligible: true,
  decisionEligibilityReason: 'credit_review_approved',
  creditReview: {
    reviewId: '798f4330-fa5b-4db1-a7f0-8e39b10b046a',
    reviewVersion: 1,
    status: 'approved',
    outcome: 'eligible',
    creditProductType: 'Home Equity, Auto Equity, Auto Finance e crédito consignado privado',
    creditIsCore: true,
    hasReceivables: true,
    receivablesStructurable: true,
    receivablesType: ['Carteira Home Equity', 'Carteira Auto Equity', 'Auto Finance', 'Crédito consignado privado'],
    receivablesRecurrenceLevel: 'high',
    receivablesPredictabilityLevel: 'medium_high',
    hasFidc: true,
    usesStructuredDebt: true,
    fundingStructureType: 'FIDCs, CRIs, FIIs e linhas bilaterais',
    capitalStructureQuality: 'mature',
    fundingGapLevel: 'low_corporate_structural_asset_funding',
    fitFidc: true,
    fitDcm: true,
    timingLevel: 'high',
    suggestedStructure: 'Emissões recorrentes de FIDC/CRI e warehouse para novas safras',
    structuralScore: 94,
    capitalScore: 78,
    receivablesScore: 95,
    executionScore: 92,
    timingScore: 86,
    confidence: 0.96,
    rationale: 'Emissor recorrente com carteira relevante, funding de mercado e oportunidade de financiar novas safras.',
    nextAction: 'Mapear emissões e vencimentos de 2026–2027 e abordar Tesouraria/DCM.',
  },
};

test('approved review remains the canonical base for a repeat FIDC issuer', () => {
  const snapshot = buildApprovedCreditReviewQualification({
    company,
    monitoringOutputs: [],
    generatedAt: '2026-07-24T20:30:00Z',
  });

  assert.ok(snapshot);
  assert.equal(snapshot.has_fidc, true);
  assert.equal(snapshot.fit_fidc, true);
  assert.equal(snapshot.fit_dcm, true);
  assert.equal(snapshot.suggested_structure_type, 'Emissões recorrentes de FIDC/CRI e warehouse para novas safras');
  assert.equal(snapshot.qualification_score_structural, 94);
  assert.equal(snapshot.qualification_score_receivables, 95);
  assert.match(snapshot.rationale_summary, /Emissor recorrente/);
  assert.equal(snapshot.evidence_payload.sourceOfTruth, 'approved_company_credit_review');
});

test('unapproved review does not bypass the heuristic engine', () => {
  const pending = structuredClone(company);
  if (pending.creditReview) pending.creditReview.status = 'needs_evidence';
  assert.equal(buildApprovedCreditReviewQualification({ company: pending, monitoringOutputs: [], generatedAt: new Date().toISOString() }), null);
});
