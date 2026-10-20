import assert from 'node:assert/strict';
import test from 'node:test';
import { CapturePersistenceService } from './capturePersistenceService.js';
import type { CaptureEngineResult, TreatmentResultRecord } from '../modules/data-capture/types.js';

const sampleTreatment = (sourceId: string, outputId: string): TreatmentResultRecord => ({
  outputId,
  companyId: 'company-1',
  sourceId,
  treatmentVersion: 'capture_treatment_v2',
  contentFingerprint: 'fingerprint-' + outputId,
  relevanceScore: 60,
  qualityScore: 70,
  confidenceScore: 70,
  evidenceLevel: 'observed',
  signalFamilies: ['receivables'],
  suggestedStructures: ['FIDC'],
  detectedKeywords: ['recebíveis'],
  normalizedFacts: {},
  qualityIssues: [],
  recommendedNextAction: 'Revisar evidências',
  intrinsicDecisionEligible: false,
  lineage: { source: sourceId },
});

const sampleResult = (sourceId: string, outputId: string, companyId: string | null = 'company-1'): CaptureEngineResult => ({
  run: {
    companyId: companyId ?? undefined,
    sourceId,
    scopeType: companyId ? 'company' : 'global',
    triggerType: 'scheduled',
    status: 'completed',
    itemsCollected: 1,
    outputsWritten: 0,
    signalsWritten: 0,
    enrichmentsWritten: 0,
  },
  documents: [],
  outputs: [],
  signals: [],
  enrichments: [],
  treatmentResults: [sampleTreatment(sourceId, outputId)],
});

const persistInMemory = async (results: CaptureEngineResult[]) => {
  const written: Record<string, Array<Record<string, unknown>>> = {};
  const client = {
    async insert(table: string, rows: Array<Record<string, unknown>>) {
      written[table] = rows;
      return rows;
    },
    async upsert(table: string, rows: Array<Record<string, unknown>>) {
      written[table] = rows;
      return rows;
    },
  };
  const service = new CapturePersistenceService();
  // Inject an in-memory persistence adapter so no live DB is touched by tests.
  Object.defineProperty(service, 'client', { value: client });
  const summary = await service.persist(results, 'lineage-regression');
  assert.equal(summary.status, 'real', summary.errors.join(' | '));
  return written;
};

test('multiple source treatments for the same company retain their own exact run IDs', async () => {
  const written = await persistInMemory([
    sampleResult('source-A', 'output-A'),
    sampleResult('source-B', 'output-B'),
  ]);
  const runs = written.data_treatment_runs ?? [];
  const outputs = written.data_treatment_results ?? [];
  assert.equal(runs.length, 2);
  assert.equal(outputs.length, 2);
  assert.notEqual(runs[0].id, runs[1].id);
  assert.equal(runs[0].source_id, 'source-A');
  assert.equal(runs[1].source_id, 'source-B');
  assert.equal(outputs[0].monitoring_output_id, 'output-A');
  assert.equal(outputs[1].monitoring_output_id, 'output-B');
  assert.equal(outputs[0].treatment_run_id, runs[0].id);
  assert.equal(outputs[1].treatment_run_id, runs[1].id);
});

test('global-scoped capture still persists treatment results when the run has no company ID', async () => {
  const written = await persistInMemory([sampleResult('source-global', 'output-global', null)]);
  const run = written.data_treatment_runs?.[0];
  const result = written.data_treatment_results?.[0];
  assert.ok(run);
  assert.ok(result);
  assert.equal(run.company_id, null);
  assert.equal(result.treatment_run_id, run.id);
  assert.equal(result.monitoring_output_id, 'output-global');
});
