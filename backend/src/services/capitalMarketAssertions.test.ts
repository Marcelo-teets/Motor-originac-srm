import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCapitalMarketDeliveryAssertions } from './capitalMarketAssertions.js';

const completedIngestion = {
  datasetCode: 'cvm_offers' as const,
  status: 'completed' as const,
  resourcesProcessed: 1,
  resourcesSkipped: 0,
  errors: [],
};

const completedDelivery = {
  datasetCode: 'cvm_offers' as const,
  status: 'completed' as const,
  eventCount: 10,
};

test('delivery assertions accept a complete ingestion and delivery', () => {
  const result = evaluateCapitalMarketDeliveryAssertions({
    requested: ['cvm_offers'],
    ingestion: [completedIngestion],
    delivery: [completedDelivery],
  });

  assert.equal(result.ok, true);
});

test('delivery assertions reject partial ingestion with processing errors', () => {
  const result = evaluateCapitalMarketDeliveryAssertions({
    requested: ['cvm_offers'],
    ingestion: [{
      ...completedIngestion,
      status: 'partial',
      errors: ['checkpoint schema mismatch'],
    }],
    delivery: [completedDelivery],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.ingestionDatasetsWithErrors, ['cvm_offers']);
});

test('delivery assertions accept a scheduled unchanged resource without errors', () => {
  const result = evaluateCapitalMarketDeliveryAssertions({
    requested: ['cvm_offers'],
    ingestion: [{
      ...completedIngestion,
      status: 'partial',
      resourcesProcessed: 0,
      resourcesSkipped: 1,
    }],
    delivery: [completedDelivery],
  });

  assert.equal(result.ok, true);
});

test('delivery assertions reject missing datasets and empty delivery', () => {
  const result = evaluateCapitalMarketDeliveryAssertions({
    requested: ['cvm_offers', 'cvm_fidc_monthly'],
    ingestion: [completedIngestion],
    delivery: [{ ...completedDelivery, eventCount: 0 }],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missingIngestionDatasets, ['cvm_fidc_monthly']);
  assert.deepEqual(result.missingDeliveryDatasets, ['cvm_fidc_monthly']);
  assert.deepEqual(result.datasetsWithoutEvents, ['cvm_offers']);
});
