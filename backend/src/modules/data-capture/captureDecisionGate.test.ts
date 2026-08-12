import assert from 'node:assert/strict';
import test from 'node:test';
import type { CaptureEngineResult, TreatmentDecisionGate } from './types.js';
import { filterCaptureResultsForDecision } from './captureDecisionGate.js';

const companyId = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const eligibleOutputId = '33333333-3333-4333-8333-333333333333';
const blockedOutputId = '44444444-4444-4444-8444-444444444444';

const baseResult: CaptureEngineResult = {
  run: {
    scopeType: 'company',
    triggerType: 'manual',
    companyId,
    status: 'completed',
    itemsCollected: 2,
    outputsWritten: 2,
    signalsWritten: 3,
    enrichmentsWritten: 2,
  },
  documents: [
    {
      id: 'doc-a', monitoringOutputId: eligibleOutputId, companyId, sourceId, documentType: 'monitoring_output',
      observedAt: new Date().toISOString(), rawPayload: {}, normalizedPayload: {}, extractionStatus: 'normalized', confidenceScore: 0.9,
    },
    {
      id: 'doc-b', monitoringOutputId: blockedOutputId, companyId, sourceId, documentType: 'monitoring_output',
      observedAt: new Date().toISOString(), rawPayload: {}, normalizedPayload: {}, extractionStatus: 'normalized', confidenceScore: 0.9,
    },
  ],
  outputs: [
    { id: eligibleOutputId, companyId, sourceId, title: 'A', summary: 'eligible', collectedAt: new Date().toISOString(), confidenceScore: 0.9, connectorStatus: 'real', normalizedPayload: {} },
    { id: blockedOutputId, companyId, sourceId, title: 'B', summary: 'blocked', collectedAt: new Date().toISOString(), confidenceScore: 0.9, connectorStatus: 'real', normalizedPayload: {} },
  ],
  signals: [
    {
      id: 'signal-a', companyId, sourceId, signalType: 'receivables_detected', signalStrength: 80, confidenceScore: 0.9,
      evidencePayload: { outputId: eligibleOutputId }, observedVsInferred: 'observed', createdAt: new Date().toISOString(),
    },
    {
      id: 'signal-b', companyId, sourceId, signalType: 'funding_gap_signal', signalStrength: 80, confidenceScore: 0.9,
      evidencePayload: { outputId: blockedOutputId }, observedVsInferred: 'inferred', createdAt: new Date().toISOString(),
    },
    {
      id: 'signal-cross', companyId, signalType: 'cross_capital_structure', signalStrength: 84, confidenceScore: 0.86,
      evidencePayload: { outputIds: [eligibleOutputId, blockedOutputId] }, observedVsInferred: 'inferred', createdAt: new Date().toISOString(),
    },
  ],
  enrichments: [
    {
      id: 'enrichment-a', companyId, enrichmentType: 'capture_treatment_profile_v2', provider: 'test',
      payload: { outputs: [{ outputId: eligibleOutputId }] }, observedVsInferred: 'inferred', createdAt: new Date().toISOString(),
    },
    {
      id: 'enrichment-b', companyId, enrichmentType: 'cross_source_corroboration', provider: 'test',
      payload: { outputIds: [eligibleOutputId, blockedOutputId] }, observedVsInferred: 'inferred', createdAt: new Date().toISOString(),
    },
  ],
  treatmentResults: [
    {
      outputId: eligibleOutputId, companyId, sourceId, treatmentVersion: 'capture_treatment_v2', contentFingerprint: 'a',
      relevanceScore: 90, qualityScore: 90, confidenceScore: 0.9, evidenceLevel: 'observed', signalFamilies: ['receivables'],
      suggestedStructures: ['FIDC'], detectedKeywords: ['recebiveis'], normalizedFacts: {}, qualityIssues: [], recommendedNextAction: 'Validar',
      intrinsicDecisionEligible: true, lineage: {},
    },
    {
      outputId: blockedOutputId, companyId, sourceId, treatmentVersion: 'capture_treatment_v2', contentFingerprint: 'b',
      relevanceScore: 90, qualityScore: 40, confidenceScore: 0.5, evidenceLevel: 'inferred', signalFamilies: ['funding_need'],
      suggestedStructures: ['Nota Comercial'], detectedKeywords: ['funding'], normalizedFacts: {}, qualityIssues: ['thin_content'], recommendedNextAction: 'Monitorar',
      intrinsicDecisionEligible: false, lineage: {},
    },
  ],
};

const gate: TreatmentDecisionGate = {
  eligibleOutputIds: [eligibleOutputId],
  blockedOutputIds: [blockedOutputId],
  outputQualityStatus: { [eligibleOutputId]: 'allow', [blockedOutputId]: 'review' },
  outputBlockReason: { [blockedOutputId]: 'source_document_gate:review' },
  allowedCompanySourcePairs: [companyId + '|' + sourceId],
  blockedCompanySourcePairs: [companyId + '|' + sourceId],
};

test('decision barrier only promotes evidence that passed the exact per-output gate', () => {
  const [filtered] = filterCaptureResultsForDecision([baseResult], gate);

  assert.ok(filtered);
  assert.deepEqual(filtered.outputs.map((item) => item.id), [eligibleOutputId]);
  assert.deepEqual(filtered.documents.map((item) => item.monitoringOutputId), [eligibleOutputId]);
  assert.deepEqual(filtered.treatmentResults.map((item) => item.outputId), [eligibleOutputId]);
  assert.deepEqual(filtered.signals.map((item) => item.id), ['signal-a']);
  assert.deepEqual(filtered.enrichments.map((item) => item.id), ['enrichment-a']);
  assert.equal(filtered.run.outputsWritten, 1);
  assert.equal(filtered.run.signalsWritten, 1);
  assert.equal(filtered.run.enrichmentsWritten, 1);
});
