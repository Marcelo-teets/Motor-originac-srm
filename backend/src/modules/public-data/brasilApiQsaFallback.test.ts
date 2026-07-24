import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBrasilApiQsaPayload } from './brasilApiQsaFallback.js';

const endpoint = 'https://brasilapi.com.br/api/cnpj/v1/17770708000124';
const observedAt = '2026-07-24T14:00:00.000Z';

const samplePayload = {
  razao_social: 'Creditas Soluções Ltda.',
  qsa: [{
    nome_socio: 'Pessoa de Teste',
    cnpj_cpf_do_socio: '123.456.789-09',
    qualificacao_socio: 'Sócio-Administrador',
    codigo_qualificacao_socio: 49,
    identificador_de_socio: 2,
    data_entrada_sociedade: '2020-01-15',
    cpf_representante_legal: '987.654.321-00',
  }],
};

test('normalizes BrasilAPI QSA with secondary-source provenance', () => {
  const records = normalizeBrasilApiQsaPayload({
    cnpj: '17.770.708/0001-24',
    endpoint,
    observedAt,
    payload: samplePayload,
  });

  assert.equal(records.length, 1);
  const record = records[0]!;
  assert.equal(record.datasetCode, 'rfb_qsa');
  assert.equal(record.sourceCode, 'src_brasilapi_cnpj');
  assert.equal(record.entityCnpj, '17770708');
  assert.equal(record.recordType, 'rfb_partner_snapshot');
  assert.equal(record.referenceDate, '2026-07-01');
  assert.equal(record.resourceKey, 'brasilapi-qsa:17770708000124:2026-07-01');
  assert.equal(record.normalizedPayload.sourceAuthority, 'secondary_public_api');
  assert.equal(record.normalizedPayload.sourceProvider, 'BrasilAPI');
  assert.equal(record.normalizedPayload.sourceConfidence, 0.78);
  assert.equal(record.normalizedPayload.officialBulkUnavailable, true);
  assert.equal(record.normalizedPayload.snapshotCadence, 'monthly');
});

test('uses one deterministic record key throughout the same month', () => {
  const first = normalizeBrasilApiQsaPayload({
    cnpj: '17770708000124',
    endpoint,
    observedAt: '2026-07-03T10:00:00.000Z',
    payload: samplePayload,
  });
  const second = normalizeBrasilApiQsaPayload({
    cnpj: '17770708000124',
    endpoint,
    observedAt: '2026-07-29T18:00:00.000Z',
    payload: samplePayload,
  });
  assert.equal(first[0]?.recordKey, second[0]?.recordKey);
  assert.equal(first[0]?.referenceDate, second[0]?.referenceDate);
});

test('never persists full partner or representative documents', () => {
  const records = normalizeBrasilApiQsaPayload({
    cnpj: '17770708000124',
    endpoint,
    observedAt,
    payload: samplePayload,
  });
  const serialized = JSON.stringify(records[0]);
  assert.equal(serialized.includes('12345678909'), false);
  assert.equal(serialized.includes('98765432100'), false);
  assert.match(serialized, /\*\*\*8909/);
  assert.match(serialized, /\*\*\*2100/);
});

test('returns no records when QSA is absent', () => {
  const records = normalizeBrasilApiQsaPayload({
    cnpj: '17770708000124',
    endpoint,
    observedAt,
    payload: { razao_social: 'Creditas Soluções Ltda.' },
  });
  assert.deepEqual(records, []);
});
