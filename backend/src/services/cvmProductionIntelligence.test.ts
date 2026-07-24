import assert from 'node:assert/strict';
import test from 'node:test';
import '../lib/supabase.test.js';
import {
  CVM_DATASETS,
  normalizeCapitalMarketRecord,
  selectDatasetResources,
} from '../modules/capital-markets/cvmCapitalMarketConnector.js';
import { extractZipEntries, parseCsv } from '../modules/capital-markets/cvmFileParser.js';
import { capitalMarketRunStatus } from './capitalMarketIngestionService.js';

const storedZip = (name: string, content: string) => {
  const nameBuffer = Buffer.from(name);
  const data = Buffer.from(content);
  const local = Buffer.alloc(30 + nameBuffer.length + data.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuffer.length, 26);
  nameBuffer.copy(local, 30);
  data.copy(local, 30 + nameBuffer.length);

  const central = Buffer.alloc(46 + nameBuffer.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuffer.length, 28);
  central.writeUInt32LE(0, 42);
  nameBuffer.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
};

test('new official CVM datasets select the latest annual resource and ignore metadata', () => {
  const selected = selectDatasetResources(CVM_DATASETS.cvm_company_dfp, [
    { name: 'Dicionário de Dados', url: 'https://dados.cvm.gov.br/META/meta_dfp.zip' },
    { name: 'Formulários DFP (2025)', url: 'https://dados.cvm.gov.br/DADOS/dfp_cia_aberta_2025.zip' },
    { name: 'Formulários DFP (2026)', url: 'https://dados.cvm.gov.br/DADOS/dfp_cia_aberta_2026.zip' },
  ]);
  assert.equal(selected.length, 1);
  assert.match(selected[0].url, /2026/);
});

test('CRI separates securitizer from debtor and promotes only the debtor as origination target', () => {
  const normalized = normalizeCapitalMarketRecord({
    datasetCode: 'cvm_cri_monthly',
    resource: { name: 'inf_mensal_cri_2026.zip', url: 'https://dados.cvm.gov.br/cri.zip' },
    fileName: 'inf_mensal_cri_2026.csv',
    observedAt: '2026-07-24T18:00:00.000Z',
    row: {
      CNPJ_Securitizadora: '11.111.111/0001-11',
      Nome_Securitizadora: 'SECURITIZADORA TESTE S.A.',
      CNPJ_Devedor: '22.222.222/0001-22',
      Nome_Devedor: 'COMPANHIA OPERACIONAL S.A.',
      Data_Referencia: '2026-06-30',
      Saldo_Devedor: '85.000.000,00',
    },
  });

  const securitizer = normalized.entityLinks.find((link) => link.entity_role === 'securitizer');
  const debtor = normalized.entityLinks.find((link) => link.entity_role === 'debtor');
  assert.equal(securitizer?.entity_cnpj, '11111111000111');
  assert.equal(securitizer?.is_primary_origination_target, false);
  assert.equal(debtor?.entity_cnpj, '22222222000122');
  assert.equal(debtor?.is_primary_origination_target, true);
  assert.equal(normalized.bronze.entity_cnpj, '22222222000122');
  assert.equal(normalized.metrics.find((metric) => metric.metric_code === 'outstanding_balance')?.metric_value, 85_000_000);
});

test('FIDC snapshot extracts typed portfolio, delinquency and subordination metrics', () => {
  const normalized = normalizeCapitalMarketRecord({
    datasetCode: 'cvm_fidc_monthly',
    resource: { name: 'inf_mensal_fidc_202606.zip', url: 'https://dados.cvm.gov.br/fidc.zip' },
    fileName: 'inf_mensal_fidc_202606.csv',
    observedAt: '2026-07-24T18:00:00.000Z',
    row: {
      CNPJ_Fundo: '33.333.333/0001-33',
      DENOM_SOCIAL: 'FIDC TESTE',
      CNPJ_Cedente: '44.444.444/0001-44',
      Razao_Social_Cedente: 'ORIGINADOR TESTE LTDA',
      DT_COMPTC: '2026-06-30',
      VL_PATRIM_LIQ: '120000000.00',
      VL_DIR_CRED: '95000000.00',
      VL_INADIMPL: '4750000.00',
      PERC_SUBORDINACAO: '18,5',
    },
  });

  assert.equal(normalized.entityLinks.find((link) => link.entity_role === 'assignor')?.is_primary_origination_target, true);
  const byCode = new Map(normalized.metrics.map((metric) => [metric.metric_code, metric.metric_value]));
  assert.equal(byCode.get('fund_nav'), 120_000_000);
  assert.equal(byCode.get('receivables_balance'), 95_000_000);
  assert.equal(byCode.get('delinquent_balance'), 4_750_000);
  assert.equal(byCode.get('subordination_ratio'), 18.5);
});

test('DFP records create stable canonical financial metrics while values remain mutable', () => {
  const base = {
    datasetCode: 'cvm_company_dfp' as const,
    resource: { name: 'dfp_cia_aberta_2026.zip', url: 'https://dados.cvm.gov.br/dfp.zip' },
    fileName: 'dfp_cia_aberta_BPP_con_2026.csv',
    observedAt: '2026-07-24T18:00:00.000Z',
  };
  const first = normalizeCapitalMarketRecord({
    ...base,
    row: {
      CNPJ_CIA: '55.555.555/0001-55',
      DENOM_CIA: 'COMPANHIA ABERTA TESTE S.A.',
      DT_FIM_EXERC: '2025-12-31',
      GRUPO_DFP: 'DF Consolidado',
      CD_CONTA: '2.02.01',
      DS_CONTA: 'Empréstimos e Financiamentos de Longo Prazo',
      VL_CONTA: '150000000.00',
    },
  });
  const updated = normalizeCapitalMarketRecord({
    ...base,
    observedAt: '2026-07-25T18:00:00.000Z',
    row: {
      CNPJ_CIA: '55.555.555/0001-55',
      DENOM_CIA: 'COMPANHIA ABERTA TESTE S.A.',
      DT_FIM_EXERC: '2025-12-31',
      GRUPO_DFP: 'DF Consolidado',
      CD_CONTA: '2.02.01',
      DS_CONTA: 'Empréstimos e Financiamentos de Longo Prazo',
      VL_CONTA: '175000000.00',
    },
  });

  assert.equal(first.event.record_key, updated.event.record_key);
  assert.notEqual(first.event.content_hash, updated.event.content_hash);
  assert.equal(updated.metrics[0].metric_code, 'long_term_debt');
  assert.equal(updated.metrics[0].metric_value, 175_000_000);
  assert.equal(updated.metrics[0].measurement_scope, 'DF Consolidado');
});

test('CSV and ZIP readers support bounded parsing and selective inflation', () => {
  const csv = 'A;B\n1;2\n3;4\n5;6\n';
  assert.equal(parseCsv(csv, 2).length, 2);
  const archive = storedZip('selected.csv', csv);
  assert.equal(extractZipEntries(archive, (name) => name === 'selected.csv').length, 1);
  assert.equal(extractZipEntries(archive, () => false).length, 0);
});

test('dataset run status treats an unchanged checkpoint-only run as completed', () => {
  assert.equal(capitalMarketRunStatus({ resourcesProcessed: 0, resourcesSkipped: 1, recordsSeen: 0, errors: [] }), 'completed');
  assert.equal(capitalMarketRunStatus({ resourcesProcessed: 1, resourcesSkipped: 0, recordsSeen: 10, errors: ['partial file'] }), 'partial');
  assert.equal(capitalMarketRunStatus({ resourcesProcessed: 0, resourcesSkipped: 0, recordsSeen: 0, errors: ['failed'] }), 'failed');
});
