import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCandidateDecisionQueueQuery } from './candidateDecisionQueueService.js';

test('normalizes defaults and bounds', () => {
  assert.deepEqual(normalizeCandidateDecisionQueueQuery(), {
    queue: 'commercial', priority: null, search: null, limit: 50, offset: 0,
  });
  assert.deepEqual(normalizeCandidateDecisionQueueQuery({
    queue: 'invalid' as 'commercial', priority: ' P1 ', search: '  Localiza  ', limit: 999, offset: -4,
  }), {
    queue: 'commercial', priority: 'P1', search: 'Localiza', limit: 200, offset: 0,
  });
});

test('accepts governed queue types', () => {
  for (const queue of ['commercial', 'market_map', 'identity', 'promoted', 'all'] as const) {
    assert.equal(normalizeCandidateDecisionQueueQuery({ queue }).queue, queue);
  }
});
