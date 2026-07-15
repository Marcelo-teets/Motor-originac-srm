import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CVM_DATASETS,
  extractZipEntries,
  normalizeCapitalMarketRecord,
  parseCsv,
  prioritizeCvmRows,
  selectDatasetResources,
} from './cvmCapitalMarketConnector.js';

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

test('extractZipEntries reads a stored CSV entry without third-party dependencies', () => {
  const entries = extractZipEntries(storedZip('sample.csv', 'A;B\n1;2\n'));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'sample.csv');
  assert.equal(entries[0].data.toString('utf8'), 'A;B\n1;2\n');
});

test('parseCsv supports semicolon files, escaped quotes and line breaks', () => {
  const rows = parseCsv('CNPJ_Emissor;Valor_Total_Oferta;Nome_Emissor\r\n"12.345.678/0001-90";"1.234.567,89";"Empresa ""Teste"""\r\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].CNPJ_Emissor, '12.345.678/0001-90');
  assert.equal(rows[0].Valor_Total_Oferta, '1.234.567,89');
  assert.equal(rows[0].Nome_Emissor, 'Empresa "Teste"');
});

test('selectDatasetResources prefers requested reference and latest resource', () => {
  const selected = selectDatasetResources(CVM_DATASETS.cvm_fidc_monthly, [
    { name: 'inf_mensal_fidc_202601.zip', url: 'https://example/202601.zip', last_modified: '2026-02-01' },
    { name: 'inf_mensal_fidc_202602.zip', url: 'https://example/202602.zip', last_modified: '2026-03-01' },
  ], '2026-01');
  assert.equal(selected[0].name, 'inf_mensal_fidc_202601.zip');
});

test('prioritizeCvmRows puts the newest offering first', () => {
  const rows = prioritizeCvmRows('cvm_offers', [
    { Data_Registro_Oferta: '1993-09-29', Numero_Registro_Oferta: 'OLD' },
    { Data_Registro_Oferta: '2026-07-14', Numero_Registro_Oferta: 'NEW' },
    { Data_Registro_Oferta: '2025-01-02', Numero_Registro_Oferta: 'MIDDLE' },
  ]);
  assert.deepEqual(rows.map((row) => row.Numero_Registro_Oferta), ['NEW', 'MIDDLE', 'OLD']);
});

test('normalizeCapitalMarketRecord extracts a debenture offering with stable lineage', () => {
  const normalized = normalizeCapitalMarketRecord({
    datasetCode: 'cvm_offers',
    resource: { name: 'oferta_distribuicao.zip', url: 'https://dados.cvm.gov.br/oferta.zip' },
    fileName: 'oferta_distribuicao.csv',
    observedAt: '2026-07-14T12:00:00.000Z',
    row: {
      CNPJ_Emissor: '12.345.678/0001-90',
      Nome_Emissor: 'Empresa Teste S.A.',
      Valor_Mobiliario: 'Debêntures',
      Valor_Total_Oferta: '250.000.000,00',
      Data_Registro: '14/07/2026',
      Numero_Registro_Oferta: 'CVM-2026-001',
    },
  });

  assert.equal(normalized.event.issuer_cnpj, '12345678000190');
  assert.equal(normalized.event.instrument_type, 'DEBENTURE');
  assert.equal(normalized.event.volume, 250_000_000);
  assert.equal(normalized.event.event_date, '2026-07-14');
  assert.equal(normalized.bronze.dataset_code, 'cvm_offers');
  assert.equal(normalized.event.record_key.length, 64);
});

test('normalizeCapitalMarketRecord supports the real CVM oferta_distribuicao schema', () => {
  const normalized = normalizeCapitalMarketRecord({
    datasetCode: 'cvm_offers',
    resource: { name: 'oferta_distribuicao.zip', url: 'https://dados.cvm.gov.br/oferta.zip' },
    fileName: 'oferta_distribuicao.csv',
    observedAt: '2026-07-15T00:00:00.000Z',
    row: {
      Tipo_Ativo: 'DEBÊNTURES SIMPLES',
      CNPJ_Emissor: '',
      CNPJ_Ofertante: '12.345.678/0001-90',
      Nome_Emissor: '',
      Nome_Ofertante: 'EMPRESA OFERTANTE S.A.',
      Valor_Total: '217000000.00',
      Data_Registro_Oferta: '2026-07-14',
      Data_Emissao: '2026-06-30',
      Modalidade_Registro: 'Concedido',
      Numero_Registro_Oferta: 'CVM/SRE/DEB/2026/001',
    },
  });

  assert.equal(normalized.event.issuer_cnpj, '12345678000190');
  assert.equal(normalized.event.issuer_name, 'EMPRESA OFERTANTE S.A.');
  assert.equal(normalized.event.instrument_type, 'DEBENTURE');
  assert.equal(normalized.event.volume, 217_000_000);
  assert.equal(normalized.event.event_date, '2026-07-14');
  assert.equal(normalized.event.status, 'Concedido');
});

test('normalizeCapitalMarketRecord maps written-out CRI and CRA descriptions', () => {
  const cri = normalizeCapitalMarketRecord({
    datasetCode: 'cvm_offers',
    resource: { name: 'oferta.zip', url: 'https://dados.cvm.gov.br/oferta.zip' },
    fileName: 'oferta.csv',
    observedAt: '2026-07-15T00:00:00.000Z',
    row: { Tipo_Ativo: 'CERTIFICADOS DE RECEBÍVEIS IMOBILIÁRIOS' },
  });
  const cra = normalizeCapitalMarketRecord({
    datasetCode: 'cvm_offers',
    resource: { name: 'oferta.zip', url: 'https://dados.cvm.gov.br/oferta.zip' },
    fileName: 'oferta.csv',
    observedAt: '2026-07-15T00:00:00.000Z',
    row: { Tipo_Ativo: 'CERTIFICADOS DE RECEBÍVEIS DO AGRONEGÓCIO' },
  });
  assert.equal(cri.event.instrument_type, 'CRI');
  assert.equal(cra.event.instrument_type, 'CRA');
});
