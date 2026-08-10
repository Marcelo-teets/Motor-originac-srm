import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSearchProfileRunRow } from './searchProfileCaptureRuntime.js';
import { runScheduledSearchProfiles } from './searchProfileScheduledRunner.js';
import type { SearchProfile } from '../types/platform.js';

const masterProfile: SearchProfile = {
  id: '5e36f366-dc57-4d4f-9b45-9a38098a0784',
  name: 'Brasil Middle Market Tech - FIDC/DCM',
  segment: 'Fintech',
  subsegment: 'Crédito PME',
  companyType: 'Plataforma',
  geography: 'Brasil',
  creditProduct: 'Crédito PME',
  receivables: ['Duplicatas'],
  targetStructure: 'FIDC',
  minimumSignalIntensity: 60,
  minimumConfidence: 0.7,
  timeWindowDays: 90,
  status: 'active',
  profilePayload: {},
};

const rawRun = (overrides: Record<string, unknown> = {}) => ({
  id: '2a69985c-e229-4860-8bc2-dfd1adc96469',
  search_profile_id: masterProfile.id,
  run_status: 'completed',
  trigger_mode: 'scheduled',
  source_count: 15,
  candidates_found: 26,
  candidates_inserted: 0,
  candidates_promoted: 0,
  notes: 'Capture completed.',
  metadata: { searchMode: 'advanced' },
  started_at: '2026-08-10T23:32:31.256Z',
  finished_at: '2026-08-10T23:32:33.791Z',
  created_at: '2026-08-10T23:32:31.256Z',
  updated_at: '2026-08-10T23:32:33.791Z',
  ...overrides,
});

test('maps a snake_case Supabase search_profile_runs row into the scheduler contract', () => {
  const mapped = mapSearchProfileRunRow(rawRun());

  assert.equal(mapped.searchProfileId, masterProfile.id);
  assert.equal(mapped.runStatus, 'completed');
  assert.equal(mapped.triggerMode, 'scheduled');
  assert.equal(mapped.sourceCount, 15);
  assert.equal(mapped.candidatesFound, 26);
  assert.equal(mapped.candidatesInserted, 0);
  assert.equal(mapped.finishedAt, '2026-08-10T23:32:33.791Z');
  assert.equal(mapped.createdAt, '2026-08-10T23:32:31.256Z');
});

test('recent Supabase-shaped completed run actually triggers the 20h cadence guard', async () => {
  let captures = 0;
  const now = new Date('2026-08-10T23:40:00.000Z');

  const summary = await runScheduledSearchProfiles({
    listSearchProfiles: async () => [masterProfile],
    listRuns: async () => [mapSearchProfileRunRow(rawRun())],
    runCapture: async () => {
      captures += 1;
      throw new Error('recent run must not execute again');
    },
  }, { now: () => now, minIntervalHours: 20 });

  assert.equal(captures, 0);
  assert.equal(summary.executed, 0);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.results[0]?.action, 'skipped_recent_run');
  assert.match(summary.results[0]?.note ?? '', /20h/);
});

test('fresh Supabase-shaped running row actually triggers the scheduler lease', async () => {
  let captures = 0;
  const now = new Date('2026-08-10T23:40:00.000Z');
  const running = rawRun({
    id: 'run-running',
    run_status: 'running',
    started_at: '2026-08-10T23:30:00.000Z',
    finished_at: null,
    created_at: '2026-08-10T23:30:00.000Z',
    updated_at: '2026-08-10T23:30:00.000Z',
  });

  const summary = await runScheduledSearchProfiles({
    listSearchProfiles: async () => [masterProfile],
    listRuns: async () => [mapSearchProfileRunRow(running)],
    runCapture: async () => {
      captures += 1;
      throw new Error('lease must block concurrent run');
    },
  }, { now: () => now, staleRunningMinutes: 30 });

  assert.equal(captures, 0);
  assert.equal(summary.results[0]?.action, 'skipped_run_in_progress');
});
