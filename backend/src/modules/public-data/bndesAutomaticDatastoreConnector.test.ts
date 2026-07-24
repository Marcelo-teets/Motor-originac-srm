import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCnpjFilterValues,
  discoverBndesAutomaticResource,
  fetchBndesAutomaticPage,
  fingerprintBndesTargetUniverse,
  formatCnpj,
} from './bndesAutomaticDatastoreConnector.js';

const withMockedFetch = async <T>(
  mock: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  callback: () => Promise<T>,
) => {
  const original = globalThis.fetch;
  globalThis.fetch = mock as typeof fetch;
  try {
    return await callback();
  } finally {
    globalThis.fetch = original;
  }
};

test('CNPJ filters include normalized and formatted variants without duplicates', () => {
  assert.equal(formatCnpj('12345678000190'), '12.345.678/0001-90');
  assert.deepEqual(buildCnpjFilterValues([
    '12.345.678/0001-90',
    '12345678000190',
    '00.000.000/0001-91',
  ]), [
    '12345678000190',
    '12.345.678/0001-90',
    '00000000000191',
    '00.000.000/0001-91',
  ]);
});

test('target fingerprint is stable across ordering and punctuation', () => {
  const left = fingerprintBndesTargetUniverse('hash-v1', [
    '12.345.678/0001-90',
    '00000000000191',
  ]);
  const right = fingerprintBndesTargetUniverse('hash-v1', [
    '00.000.000/0001-91',
    '12345678000190',
  ]);
  assert.equal(left, right);
  assert.notEqual(left, fingerprintBndesTargetUniverse('hash-v2', ['12345678000190', '00000000000191']));
});

test('resource discovery uses authoritative CKAN metadata', async () => {
  await withMockedFetch(async (input) => {
    assert.match(String(input), /resource_show/);
    return new Response(JSON.stringify({
      success: true,
      result: {
        id: '612faa0b-b6be-4b2c-9317-da5dc2c0b901',
        name: 'Operações indiretas automáticas',
        url: 'https://example.test/bndes.csv',
        hash: 'md5-current',
        size: 1_192_933_510,
        datastore_active: true,
        last_modified: '2026-07-22T21:02:00.000000',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, async () => {
    const resource = await discoverBndesAutomaticResource();
    assert.equal(resource.resourceHash, 'md5-current');
    assert.equal(resource.sizeBytes, 1_192_933_510);
    assert.equal(resource.datastoreActive, true);
    assert.equal(resource.metadataSource, 'resource_show');
    assert.equal(resource.referenceDate, '2026-07-22');
    assert.match(resource.key, /md5-current/);
  });
});

test('datastore query sends exact CNPJ filters and pagination', async () => {
  let requestBody: Record<string, unknown> | null = null;
  await withMockedFetch(async (input, init) => {
    assert.match(String(input), /datastore_search/);
    assert.equal(init?.method, 'POST');
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      success: true,
      result: {
        total: 1,
        records: [{
          _id: 1,
          cliente: 'Empresa Teste',
          cpf_cnpj: '12.345.678/0001-90',
          valor_da_operacao_em_reais: '1000,00',
        }],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, async () => {
    const page = await fetchBndesAutomaticPage({
      resourceId: 'resource-test',
      cnpjFilters: ['12345678000190', '12.345.678/0001-90'],
      offset: 20,
      limit: 50,
    });
    assert.equal(page.total, 1);
    assert.equal(page.records.length, 1);
    assert.deepEqual(requestBody, {
      resource_id: 'resource-test',
      filters: { cpf_cnpj: ['12345678000190', '12.345.678/0001-90'] },
      offset: 20,
      limit: 50,
      sort: '_id asc',
      include_total: true,
    });
  });
});
