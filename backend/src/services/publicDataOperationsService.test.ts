import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyPublicDataOperationsSnapshot, normalizePublicDataOperationsSnapshot } from './publicDataOperationsService.js';

test('normalizes an operational dataset snapshot from Supabase JSON', () => {
  const snapshot = normalizePublicDataOperationsSnapshot({
    generatedAt: '2026-07-22T10:00:00Z',
    summary: {
      totalDatasets: '6',
      healthyDatasets: 1,
      waitingDatasets: 5,
      registeredSources: 5,
      targetCompaniesWithValidCnpj: 8,
    },
    blockers: [{
      code: 'github_actions_supabase_secrets',
      severity: 'critical',
      title: 'Secrets ausentes',
      detail: 'Loader não inicializou.',
      nextAction: 'Cadastrar secrets.',
    }],
    datasets: [{
      datasetCode: 'cgu_ceis',
      sourceCode: 'src_cgu_transparencia_bulk',
      displayName: 'CGU · CEIS',
      sourceStatus: 'partial',
      sourceHealth: 'degraded',
      cadence: 'daily',
      executionMode: 'scheduled',
      signalType: 'legal_compliance_risk',
      operationalStatus: 'waiting',
      nextAction: 'Cadastrar secrets.',
      latestRun: null,
      lifetime: {
        runCount: 0,
        checkpointCount: 0,
        rowsScanned: 0,
      },
    }],
  });

  assert.equal(snapshot.generatedAt, '2026-07-22T10:00:00Z');
  assert.equal(snapshot.summary.totalDatasets, 6);
  assert.equal(snapshot.summary.registeredSources, 5);
  assert.equal(snapshot.summary.targetCompaniesWithValidCnpj, 8);
  assert.equal(snapshot.blockers[0]?.severity, 'critical');
  assert.equal(snapshot.datasets[0]?.datasetCode, 'cgu_ceis');
  assert.equal(snapshot.datasets[0]?.operationalStatus, 'waiting');
  assert.equal(snapshot.datasets[0]?.lifetime.signalsPersisted, 0);
});

test('falls back safely for malformed payloads', () => {
  const snapshot = normalizePublicDataOperationsSnapshot({
    summary: { totalDatasets: 'not-a-number' },
    blockers: [{ severity: 'unknown' }],
    datasets: [{ operationalStatus: 'mystery', lifetime: null }],
  });

  assert.equal(snapshot.summary.totalDatasets, 0);
  assert.equal(snapshot.blockers[0]?.severity, 'medium');
  assert.equal(snapshot.datasets[0]?.operationalStatus, 'waiting');
  assert.equal(snapshot.datasets[0]?.lifetime.runCount, 0);
});

test('empty snapshot is explicit and contains no fabricated operations', () => {
  const snapshot = emptyPublicDataOperationsSnapshot();
  assert.equal(snapshot.summary.totalDatasets, 0);
  assert.deepEqual(snapshot.blockers, []);
  assert.deepEqual(snapshot.datasets, []);
});
