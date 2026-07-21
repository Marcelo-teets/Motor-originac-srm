import test from 'node:test';
import assert from 'node:assert/strict';
import { runScheduledSearchProfiles } from './searchProfileScheduledRunner.js';
import type { SearchProfileRunRecord, SearchProfileCaptureSummary } from './searchProfileCaptureService.js';
import type { SearchProfile } from '../types/platform.js';

const profile = (id: string, status: 'active' | 'paused' = 'active'): SearchProfile => ({
  id,
  name: `Profile ${id}`,
  segment: 'Fintech',
  subsegment: 'Credit',
  companyType: 'Scale-up',
  geography: 'Brasil',
  creditProduct: 'Antecipação',
  receivables: ['Cartão'],
  targetStructure: 'FIDC',
  minimumSignalIntensity: 60,
  minimumConfidence: 0.7,
  timeWindowDays: 90,
  status,
  profilePayload: {},
});

const run = (overrides: Partial<SearchProfileRunRecord>): SearchProfileRunRecord => ({
  id: 'run_1',
  searchProfileId: 'sp_1',
  runStatus: 'completed',
  triggerMode: 'scheduled',
  sourceCount: 1,
  candidatesFound: 3,
  candidatesInserted: 3,
  candidatesPromoted: 0,
  metadata: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const summaryFor = (profileId: string): SearchProfileCaptureSummary => ({
  run: run({ id: `run_${profileId}`, searchProfileId: profileId, candidatesFound: 5, candidatesInserted: 4, notes: 'ok' }),
  candidates: [],
  dedupedAgainstExisting: 1,
});

test('runner executes active profiles and ignores paused ones', async () => {
  const captured: string[] = [];
  const summary = await runScheduledSearchProfiles({
    listSearchProfiles: async () => [profile('sp_1'), profile('sp_2', 'paused')],
    listRuns: async () => [],
    runCapture: async (id) => {
      captured.push(id);
      return summaryFor(id);
    },
  });

  assert.deepEqual(captured, ['sp_1']);
  assert.equal(summary.activeProfiles, 1);
  assert.equal(summary.executed, 1);
  assert.equal(summary.results[0]!.candidatesInserted, 4);
});

test('runner skips profiles with a recent completed run (idempotência de cadência)', async () => {
  const now = new Date('2026-07-21T12:00:00Z');
  const summary = await runScheduledSearchProfiles(
    {
      listSearchProfiles: async () => [profile('sp_1')],
      listRuns: async () => [run({ finishedAt: '2026-07-21T02:00:00Z', createdAt: '2026-07-21T02:00:00Z' })],
      runCapture: async () => {
        throw new Error('must not run');
      },
    },
    { now: () => now },
  );

  assert.equal(summary.executed, 0);
  assert.equal(summary.results[0]!.action, 'skipped_recent_run');
});

test('runner respects the lease for fresh running runs but recovers stale ones', async () => {
  const now = new Date('2026-07-21T12:00:00Z');
  const fresh = await runScheduledSearchProfiles(
    {
      listSearchProfiles: async () => [profile('sp_1')],
      listRuns: async () => [run({ runStatus: 'running', startedAt: '2026-07-21T11:50:00Z', createdAt: '2026-07-21T11:50:00Z' })],
      runCapture: async () => {
        throw new Error('must not run');
      },
    },
    { now: () => now },
  );
  assert.equal(fresh.results[0]!.action, 'skipped_run_in_progress');

  let ran = false;
  const stale = await runScheduledSearchProfiles(
    {
      listSearchProfiles: async () => [profile('sp_1')],
      listRuns: async () => [run({ runStatus: 'running', startedAt: '2026-07-21T09:00:00Z', createdAt: '2026-07-21T09:00:00Z' })],
      runCapture: async (id) => {
        ran = true;
        return summaryFor(id);
      },
    },
    { now: () => now },
  );
  assert.equal(ran, true, 'stale running run must not block the scheduler forever');
  assert.equal(stale.executed, 1);
});

test('runner records failures without aborting the batch', async () => {
  const summary = await runScheduledSearchProfiles({
    listSearchProfiles: async () => [profile('sp_1'), profile('sp_2')],
    listRuns: async () => [],
    runCapture: async (id) => {
      if (id === 'sp_1') throw new Error('boom');
      return summaryFor(id);
    },
  });

  assert.equal(summary.failed, 1);
  assert.equal(summary.executed, 1);
  assert.equal(summary.results.find((item) => item.searchProfileId === 'sp_1')!.action, 'failed');
});
