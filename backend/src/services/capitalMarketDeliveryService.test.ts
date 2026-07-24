import assert from 'node:assert/strict';
import test from 'node:test';
import './capitalMarketAssertions.test.js';
import { normalizeCapitalMarketDeliveryResult } from './capitalMarketDeliveryService.js';

test('normalizes CVM delivery metrics returned by Supabase RPC', () => {
  const result = normalizeCapitalMarketDeliveryResult('cvm_offers', {
    datasetCode: 'cvm_offers',
    eventCount: '1250',
    linkedEvents: 25,
    signalsWritten: '12',
    candidatesUpserted: 318,
    generatedAt: '2026-07-24T15:00:00.000Z',
  });

  assert.deepEqual(result, {
    datasetCode: 'cvm_offers',
    status: 'completed',
    eventCount: 1250,
    linkedEvents: 25,
    signalsWritten: 12,
    candidatesUpserted: 318,
    generatedAt: '2026-07-24T15:00:00.000Z',
    error: null,
  });
});

test('uses safe defaults for incomplete RPC payloads', () => {
  const result = normalizeCapitalMarketDeliveryResult('cvm_fidc_monthly', null);

  assert.equal(result.datasetCode, 'cvm_fidc_monthly');
  assert.equal(result.eventCount, 0);
  assert.equal(result.linkedEvents, 0);
  assert.equal(result.signalsWritten, 0);
  assert.equal(result.candidatesUpserted, 0);
  assert.equal(result.status, 'completed');
  assert.equal(result.error, null);
});
