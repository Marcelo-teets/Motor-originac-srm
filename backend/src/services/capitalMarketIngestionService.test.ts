import assert from 'node:assert/strict';
import test from 'node:test';
import '../lib/supabase.test.js';
import { shouldSkipCapitalMarketResource } from './capitalMarketIngestionService.js';

const resource = {
  id: 'resource-1',
  name: 'ofertas_2026.csv',
  url: 'https://dados.cvm.gov.br/ofertas_2026.csv',
  last_modified: '2026-07-14T12:00:00Z',
};

const checkpoint = {
  resource_key: 'resource-1',
  resource_modified_at: '2026-07-14T12:00:00.000Z',
  content_hash: 'abc',
  status: 'completed' as const,
  last_successful_run_at: '2026-07-14T12:05:00.000Z',
};

test('scheduled ingestion skips an unchanged resource with a completed checkpoint', () => {
  assert.equal(shouldSkipCapitalMarketResource({ triggerType: 'schedule', resource, checkpoint }), true);
});

test('manual and backfill runs never skip solely from the checkpoint timestamp', () => {
  assert.equal(shouldSkipCapitalMarketResource({ triggerType: 'manual', resource, checkpoint }), false);
  assert.equal(shouldSkipCapitalMarketResource({ triggerType: 'backfill', resource, checkpoint }), false);
});

test('explicit reference forces processing even in scheduled mode', () => {
  assert.equal(shouldSkipCapitalMarketResource({
    triggerType: 'schedule',
    reference: '2026-07',
    resource,
    checkpoint,
  }), false);
});

test('failed checkpoint is retried even when the resource timestamp is unchanged', () => {
  assert.equal(shouldSkipCapitalMarketResource({
    triggerType: 'schedule',
    resource,
    checkpoint: { ...checkpoint, status: 'failed' },
  }), false);
});
