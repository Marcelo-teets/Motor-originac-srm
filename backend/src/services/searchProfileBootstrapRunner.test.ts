import assert from 'node:assert/strict';
import test from 'node:test';
import type { SearchProfile } from '../types/platform.js';
import { runSearchProfileBootstrap } from './searchProfileBootstrapRunner.js';

const profile = (id: string, status: SearchProfile['status'] = 'active'): SearchProfile => ({
  id,
  name: id,
  segment: 'Fintech',
  subsegment: 'Payments',
  companyType: 'Plataforma',
  geography: 'Brasil',
  creditProduct: 'Crédito',
  receivables: ['Recebíveis'],
  targetStructure: 'FIDC',
  minimumSignalIntensity: 60,
  minimumConfidence: 0.7,
  timeWindowDays: 90,
  status,
  profilePayload: { mode: 'advanced' },
});

test('bootstrap runs active profiles directly without cadence guards', async () => {
  const calls: string[] = [];
  const summary = await runSearchProfileBootstrap({
    listSearchProfiles: async () => [profile('a'), profile('b'), profile('paused', 'paused')],
    runCapture: async (searchProfileId) => {
      calls.push(searchProfileId);
      return {
        run: {
          id: `run-${searchProfileId}`,
          searchProfileId,
          runStatus: 'completed',
          triggerMode: 'bootstrap',
          sourceCount: 2,
          candidatesFound: 3,
          candidatesInserted: 2,
          candidatesPromoted: 0,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        candidates: [],
        dedupedAgainstExisting: 1,
      };
    },
  });

  assert.deepEqual(calls, ['a', 'b']);
  assert.equal(summary.activeProfiles, 2);
  assert.equal(summary.selectedProfiles, 2);
  assert.equal(summary.candidatesFound, 6);
  assert.equal(summary.candidatesInserted, 4);
  assert.equal(summary.failed, 0);
});

test('bootstrap can scope profiles explicitly and keeps failures isolated', async () => {
  const calls: string[] = [];
  const summary = await runSearchProfileBootstrap({
    listSearchProfiles: async () => [profile('a'), profile('b'), profile('c')],
    runCapture: async (searchProfileId) => {
      calls.push(searchProfileId);
      if (searchProfileId === 'b') throw new Error('boom');
      return {
        run: {
          id: `run-${searchProfileId}`,
          searchProfileId,
          runStatus: 'completed',
          triggerMode: 'bootstrap',
          sourceCount: 1,
          candidatesFound: 1,
          candidatesInserted: 1,
          candidatesPromoted: 0,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        candidates: [],
        dedupedAgainstExisting: 0,
      };
    },
  }, { profileIds: ['b', 'c'], maxProfiles: 2 });

  assert.deepEqual(calls, ['b', 'c']);
  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.candidatesFound, 1);
  assert.equal(summary.candidatesInserted, 1);
});
