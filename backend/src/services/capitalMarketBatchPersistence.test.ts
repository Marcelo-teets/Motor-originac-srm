import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCapitalMarketRecord } from '../modules/capital-markets/cvmCapitalMarketConnector.js';
import {
  persistCapitalMarketRecordsAdaptive,
  serializeCapitalMarketBatch,
  type BatchPersistResult,
} from './capitalMarketIngestionService.js';

const record = normalizeCapitalMarketRecord({
  datasetCode: 'cvm_cri_monthly',
  resource: { name: 'inf_mensal_cri_2026.zip', url: 'https://dados.cvm.gov.br/cri.zip' },
  fileName: 'inf_mensal_cri_2026.csv',
  observedAt: '2026-07-24T20:00:00.000Z',
  row: {
    CNPJ_Securitizadora: '11.111.111/0001-11',
    CNPJ_Devedor: '22.222.222/0001-22',
    Nome_Devedor: 'COMPANHIA OPERACIONAL S.A.',
    Data_Referencia: '2026-06-30',
    Saldo_Devedor: '85.000.000,00',
  },
});

const resultFor = (size: number): BatchPersistResult => ({
  bronzeRowsWritten: size,
  eventsWritten: size,
  entityLinksWritten: size * 2,
  metricsWritten: size,
  recordsInserted: size,
  recordsUpdated: 0,
  recordsUnchanged: 0,
});

test('serializes normalized CVM records for the atomic Postgres batch contract', () => {
  const [serialized] = serializeCapitalMarketBatch([record]);
  assert.equal(serialized.event.record_key, record.event.record_key);
  assert.equal(serialized.bronze.content_hash, record.bronze.content_hash);
  assert.equal(serialized.entity_links.length, record.entityLinks.length);
  assert.equal(serialized.entity_links.find((link) => link.entity_role === 'debtor')?.is_primary_origination_target, true);
  assert.equal(serialized.metrics.find((metric) => metric.metric_code === 'outstanding_balance')?.metric_value, 85_000_000);
  assert.equal('entityLinks' in serialized, false);
});

test('adaptively reduces the effective batch size after Supabase statement timeouts', async () => {
  const attempts: number[] = [];
  const records = Array.from({ length: 8 }, () => record);

  const persisted = await persistCapitalMarketRecordsAdaptive(records, async (batch) => {
    attempts.push(batch.length);
    if (batch.length > 2) {
      throw new Error('Supabase rpc failed: 57014 canceling statement due to statement timeout');
    }
    return resultFor(batch.length);
  }, 8);

  assert.deepEqual(attempts, [8, 4, 2, 2, 2, 2]);
  assert.equal(persisted.effectiveBatchSize, 2);
  assert.equal(persisted.timeoutSplits, 2);
  assert.equal(persisted.bronzeRowsWritten, 8);
  assert.equal(persisted.eventsWritten, 8);
  assert.equal(persisted.entityLinksWritten, 16);
  assert.equal(persisted.recordsInserted, 8);
});

test('does not hide non-timeout persistence failures', async () => {
  await assert.rejects(
    persistCapitalMarketRecordsAdaptive([record], async () => {
      throw new Error('permission denied');
    }),
    /permission denied/,
  );
});
