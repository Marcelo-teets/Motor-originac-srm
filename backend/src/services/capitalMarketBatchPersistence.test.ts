import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCapitalMarketRecord } from '../modules/capital-markets/cvmCapitalMarketConnector.js';
import { serializeCapitalMarketBatch } from './capitalMarketIngestionService.js';

test('serializes normalized CVM records for the atomic Postgres batch contract', () => {
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

  const [serialized] = serializeCapitalMarketBatch([record]);
  assert.equal(serialized.event.record_key, record.event.record_key);
  assert.equal(serialized.bronze.content_hash, record.bronze.content_hash);
  assert.equal(serialized.entity_links.length, record.entityLinks.length);
  assert.equal(serialized.entity_links.find((link) => link.entity_role === 'debtor')?.is_primary_origination_target, true);
  assert.equal(serialized.metrics.find((metric) => metric.metric_code === 'outstanding_balance')?.metric_value, 85_000_000);
  assert.equal('entityLinks' in serialized, false);
});
