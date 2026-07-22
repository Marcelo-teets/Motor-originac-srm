import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCvmFreEntry,
  isStrategicArchiveEntry,
  normalizeStrategicPublicRow,
} from './strategicPublicDatasetConnector.js';
import type { PublicBulkResource } from './publicBulkDatasetConnector.js';

const resource = (overrides: Partial<PublicBulkResource> = {}): PublicBulkResource => ({
  key: 'strategic-resource-test',
  name: 'resource.zip',
  url: 'https://example.gov.br/resource.zip',
  format: 'zip',
  encoding: 'latin1',
  delimiter: ';',
  referenceDate: '2026-07-01',
  ...overrides,
});

const targets = {
  targetCnpjs: new Set(['12345678000190']),
  targetRoots: new Set(['12345678']),
};

test('RFB QSA normalization matches the Company Master root and redacts natural-person identifiers', () => {
  const record = normalizeStrategicPublicRow({
    datasetCode: 'rfb_qsa',
    resource: resource({ name: 'Socios0.zip' }),
    entryName: 'K3241.K03200Y0.D60713.SOCIOCSV',
    ...targets,
    row: {
      cnpj_basico: '12345678',
      identificador_socio: '2',
      nome_socio_razao_social: 'SOCIO TESTE',
      cnpj_cpf_socio: '123.456.789-00',
      qualificacao_socio: '49',
      data_entrada_sociedade: '20250615',
      pais: '105',
      representante_legal: '987.654.321-00',
      nome_representante: 'REPRESENTANTE TESTE',
      qualificacao_representante_legal: '05',
      faixa_etaria: '5',
    },
  });

  assert.ok(record);
  assert.equal(record.entityCnpj, '12345678');
  assert.equal(record.recordType, 'rfb_partner_snapshot');
  assert.equal(record.referenceDate, '2026-07-01');
  assert.equal(record.normalizedPayload.partnerType, 'natural_person');
  assert.equal(record.normalizedPayload.partnerDocumentMasked, '***8900');
  assert.equal(record.rawPayload.cnpj_cpf_socio, '***8900');
  assert.equal(record.rawPayload.representante_legal, '***2100');
  assert.notEqual(record.normalizedPayload.partnerDocumentHash, '12345678900');
  assert.equal(JSON.stringify(record).includes('12345678900'), false);
});

test('RFB QSA ignores companies outside the monitored Company Master roots', () => {
  const record = normalizeStrategicPublicRow({
    datasetCode: 'rfb_qsa',
    resource: resource(),
    entryName: 'SOCIOCSV',
    ...targets,
    row: {
      cnpj_basico: '99999999',
      nome_socio_razao_social: 'OUTRO SOCIO',
      cnpj_cpf_socio: '11111111111',
    },
  });
  assert.equal(record, null);
});

test('RFB QSA accepts official SOCIOCSV archive entries without a file extension', () => {
  assert.equal(
    isStrategicArchiveEntry('rfb_qsa', 'K3241.K03200Y0.D60713.SOCIOCSV', '(Socios|SOCIOCSV|SOCIO)'),
    true,
  );
  assert.equal(isStrategicArchiveEntry('rfb_qsa', 'Paises.csv'), false);
  assert.equal(isStrategicArchiveEntry('rfb_qsa', 'directory/'), false);
});

test('CVM FRE entry classification accepts only capital-structure sections used by origination', () => {
  assert.equal(
    classifyCvmFreEntry('fre_cia_aberta_endividamento_2026.csv'),
    'cvm_fre_debt_profile',
  );
  assert.equal(
    classifyCvmFreEntry('fre_cia_aberta_transacao_parte_relacionada_2026.csv'),
    'cvm_fre_related_party_transaction',
  );
  assert.equal(classifyCvmFreEntry('fre_cia_aberta_auditor_2026.csv'), null);
});

test('CVM FRE debt rows create auditable debt-profile evidence for matching CNPJs', () => {
  const record = normalizeStrategicPublicRow({
    datasetCode: 'cvm_fre_capital_structure',
    resource: resource({ key: 'cvm-fre:2026', referenceDate: '2026-01-01' }),
    entryName: 'fre_cia_aberta_endividamento_2026.csv',
    ...targets,
    row: {
      cnpj_cia: '12.345.678/0001-90',
      denom_cia: 'EMPRESA TESTE S.A.',
      data_referencia: '30/06/2026',
      valor_total: '12.500.000,50',
      instrumento: 'Debêntures',
      indexador: 'CDI',
      taxa_juros: '3,50',
      situacao: 'Vigente',
      descricao: 'Dívida financeira consolidada',
    },
  });

  assert.ok(record);
  assert.equal(record.entityCnpj, '12345678000190');
  assert.equal(record.recordType, 'cvm_fre_debt_profile');
  assert.equal(record.referenceDate, '2026-06-30');
  assert.equal(record.amount, 12_500_000.50);
  assert.equal(record.normalizedPayload.instrument, 'Debêntures');
  assert.equal(record.normalizedPayload.indexer, 'CDI');
  assert.equal(record.sourceCode, 'src_cvm_fre_capital_structure');
});

test('CVM FRE rows outside the selected company universe are not persisted', () => {
  const record = normalizeStrategicPublicRow({
    datasetCode: 'cvm_fre_capital_structure',
    resource: resource(),
    entryName: 'fre_cia_capital_social_aumento_2026.csv',
    ...targets,
    row: {
      cnpj_cia: '00.000.000/0001-00',
      denom_cia: 'OUTRA COMPANHIA',
      valor_aumento: '1000000,00',
    },
  });
  assert.equal(record, null);
});
