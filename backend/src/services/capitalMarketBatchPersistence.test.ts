import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCapitalMarketRecord } from '../modules/capital-markets/cvmCapitalMarketConnector.js';
import {
  normalizeCvmDownloadResource,
  persistCapitalMarketBatches,
  serializeCapitalMarketBatch,
} from './capitalMarketIngestionService.js';

const normalizedRecord = () => normalizeCapitalMarketRecord({
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

test('serializes normalized CVM records for the atomic Postgres batch contract', () => {
  const record = normalizedRecord();
  const [serialized] = serializeCapitalMarketBatch([record]);
  assert.equal(serialized.event.record_key, record.event.record_key);
  assert.equal(serialized.bronze.content_hash, record.bronze.content_hash);
  assert.equal(serialized.entity_links.length, record.entityLinks.length);
  assert.equal(serialized.entity_links.find((link) => link.entity_role === 'debtor')?.is_primary_origination_target, true);
  assert.equal(serialized.metrics.find((metric) => metric.metric_code === 'outstanding_balance')?.metric_value, 85_000_000);
  assert.equal('entityLinks' in serialized, false);
});

test('splits only timed-out CVM batches and preserves aggregate counters', async () => {
  const records = Array.from({ length: 5 }, normalizedRecord);
  const attempts: number[] = [];
  const result = await persistCapitalMarketBatches(records, async (batch) => {
    attempts.push(batch.length);
    if (batch.length > 2) throw new Error('57014: canceling statement due to statement timeout');
    return {
      bronzeRowsWritten: batch.length,
      eventsWritten: batch.length,
      entityLinksWritten: batch.length,
      metricsWritten: batch.length,
      recordsInserted: batch.length,
      recordsUpdated: 0,
      recordsUnchanged: 0,
    };
  }, 4);

  assert.deepEqual(attempts, [4, 2, 2, 1]);
  assert.equal(result.eventsWritten, 5);
  assert.equal(result.recordsInserted, 5);
});

test('uses CKAN CSV metadata when the resource title has no extension', () => {
  const resource = normalizeCvmDownloadResource({
    name: 'Documentos Eventuais de Fundos de Investimento (2026)',
    url: 'https://dados.cvm.gov.br/dados/FI/DOC/EVENTUAL/DADOS/eventual_fi_2026.csv',
    format: 'CSV',
  });
  assert.equal(resource.name, 'Documentos Eventuais de Fundos de Investimento (2026).csv');
});
