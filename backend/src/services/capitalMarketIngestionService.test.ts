import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithRunWideRowBudget, shouldSkipCapitalMarketResource } from './capitalMarketIngestionService.js';

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

test('max rows is a budget for the whole run, not per dataset', async () => {
  const calls: Array<[string, number]> = [];
  const seen: Record<string, number> = { cvm_fidc_monthly: 15_652, cvm_cri_monthly: 20_000, cvm_cra_monthly: 20_000 };
  const result = await runWithRunWideRowBudget(
    ['cvm_fidc_monthly', 'cvm_cri_monthly', 'cvm_cra_monthly'],
    20_000,
    async (datasetCode, datasetMaxRows) => {
      calls.push([datasetCode, datasetMaxRows]);
      return { recordsSeen: Math.min(seen[datasetCode] ?? 0, datasetMaxRows) };
    },
  );
  assert.deepEqual(calls, [['cvm_fidc_monthly', 20_000], ['cvm_cri_monthly', 4_348]]);
  assert.deepEqual(result.deferredDatasets, ['cvm_cra_monthly']);
  assert.equal(result.remainingRows, 0);
  assert.equal(result.summaries.reduce((sum, item) => sum + item.recordsSeen, 0), 20_000);
});

test('unchanged scheduled datasets do not consume the run budget', async () => {
  const result = await runWithRunWideRowBudget(
    ['cvm_offers', 'cvm_fidc_monthly'],
    100,
    async (datasetCode, datasetMaxRows) => ({ recordsSeen: datasetCode === 'cvm_offers' ? 0 : Math.min(40, datasetMaxRows) }),
  );
  assert.deepEqual(result.deferredDatasets, []);
  assert.equal(result.remainingRows, 60);
});
