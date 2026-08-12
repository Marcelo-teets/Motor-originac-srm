import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanySeed, MonitoringOutput } from '../../types/platform.js';
import { CAPTURE_TREATMENT_VERSION, treatCaptureOutputs } from './captureTreatment.js';

const company = {
  id: '11111111-1111-4111-8111-111111111111',
  legalName: 'Empresa Teste S.A.',
  tradeName: 'Empresa Teste',
  cnpj: '12.345.678/0001-99',
  website: 'https://empresa.test',
  geography: 'Brasil',
  segment: 'Fintech',
  subsegment: 'Crédito',
  companyType: 'fintech',
  stage: 'growth',
  creditProduct: 'capital de giro',
  receivables: ['duplicatas'],
  currentFundingStructure: 'bancário',
  description: 'Empresa de teste para o motor de tratamento.',
  signals: [],
  monitoring: { status: 'active', lastRunAt: '', outputs24h: 0, triggers24h: 0, websiteChanges: [], feedHighlights: [] },
  enrichment: {
    governanceMaturity: 'medium', underwritingMaturity: 'medium', operationalMaturity: 'medium', riskModelMaturity: 'medium',
    unitEconomicsQuality: 'mixed', spreadVsFundingQuality: 'neutral', concentrationRisk: 'medium', delinquencySignal: 'low',
    sourceConfidence: 0.8, sourceNotes: [],
  },
  sourceRecords: [], marketMapPeers: [], activities: [],
} satisfies CompanySeed;

const highQualityOutput = (url: string): MonitoringOutput => ({
  id: '22222222-2222-4222-8222-222222222222',
  companyId: company.id,
  sourceId: '33333333-3333-4333-8333-333333333333',
  title: 'Empresa amplia carteira de recebíveis e prepara FIDC',
  summary: 'A empresa informou expansão da carteira de recebíveis, com direitos creditórios recorrentes, antecipação e funding para sustentar o crescimento. O material também menciona FIDC como alternativa de estruturação.',
  collectedAt: new Date().toISOString(),
  confidenceScore: 0.92,
  connectorStatus: 'real',
  normalizedPayload: { sourceUrl: url, sourceCode: 'src_company_website' },
});

test('treatment v2 promotes strong evidence and keeps a stable canonical fingerprint', () => {
  const first = treatCaptureOutputs(company, [highQualityOutput('https://empresa.test/noticia?utm_source=x')], new Date().toISOString());
  const second = treatCaptureOutputs(company, [highQualityOutput('https://empresa.test/noticia?utm_source=y')], new Date().toISOString());

  assert.equal(first.treatmentResults.length, 1);
  const treatment = first.treatmentResults[0]!;
  assert.equal(treatment.treatmentVersion, CAPTURE_TREATMENT_VERSION);
  assert.equal(treatment.intrinsicDecisionEligible, true);
  assert.ok(treatment.qualityScore >= 55);
  assert.ok(treatment.relevanceScore >= 55);
  assert.ok(treatment.signalFamilies.includes('receivables'));
  assert.ok(treatment.signalFamilies.includes('fidc_fit'));
  assert.ok(treatment.suggestedStructures.includes('FIDC'));
  assert.equal(first.signals.length > 0, true);
  assert.equal(first.outputs[0]?.normalizedPayload.treatment !== undefined, true);
  assert.equal(treatment.contentFingerprint, second.treatmentResults[0]?.contentFingerprint);
});

test('treatment v2 retains weak evidence for audit but blocks it from signal generation', () => {
  const weak: MonitoringOutput = {
    id: '44444444-4444-4444-8444-444444444444',
    companyId: company.id,
    sourceId: '55555555-5555-4555-8555-555555555555',
    title: 'Nota curta',
    summary: 'crédito',
    collectedAt: new Date().toISOString(),
    confidenceScore: 0.25,
    connectorStatus: 'partial',
    normalizedPayload: {},
  };

  const result = treatCaptureOutputs(company, [weak], new Date().toISOString());
  const treatment = result.treatmentResults[0]!;

  assert.equal(treatment.intrinsicDecisionEligible, false);
  assert.ok(treatment.qualityIssues.includes('partial_connector'));
  assert.ok(treatment.qualityIssues.includes('missing_source_url'));
  assert.ok(treatment.qualityIssues.includes('thin_content'));
  assert.ok(treatment.qualityIssues.includes('low_source_confidence'));
  assert.equal(result.signals.length, 0);
  assert.equal(result.outputs.length, 1);
});
