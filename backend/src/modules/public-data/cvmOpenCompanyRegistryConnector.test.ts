import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchCvmRegistryWithRetry,
  streamCvmOpenCompanyRegistry,
  type CvmOpenCompanyRegistryRecord,
  type CvmOpenCompanyRegistryResource,
} from './cvmOpenCompanyRegistryConnector.js';

test('streams only exact target CNPJs from the official registry contract', async () => {
  const csv = [
    'CNPJ_CIA;DENOM_SOCIAL;DENOM_COMERC;CD_CVM;DT_REG;DT_CANCEL;SIT;SIT_EMISSOR;CATEG_REG;SETOR_ATIV;TP_MERC',
    '16.670.085/0001-55;LOCALIZA RENT A CAR S.A.;LOCALIZA;10670;23/05/2005;;ATIVO;FASE OPERACIONAL;Categoria A;Comércio;BOLSA',
    '00.000.000/0001-91;EMPRESA FORA DO ALVO S.A.;;99999;01/01/2000;;ATIVO;FASE OPERACIONAL;Categoria A;Outros;BOLSA',
  ].join('\n');
  const resource: CvmOpenCompanyRegistryResource = {
    key: 'test',
    name: 'CVM test',
    url: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
    datasetUrl: 'https://dados.cvm.gov.br/dataset/cia_aberta-cad',
    modifiedAt: null,
    etag: null,
  };
  const records: CvmOpenCompanyRegistryRecord[] = [];
  const stats = await streamCvmOpenCompanyRegistry({
    resource,
    targetCnpjs: new Set(['16670085000155']),
    onRecord: async (record) => { records.push(record); },
  });

  assert.equal(stats.rowsScanned, 2);
  assert.equal(stats.recordsMatched, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].cnpj, '16670085000155');
  assert.equal(records[0].companyName, 'LOCALIZA RENT A CAR S.A.');
  assert.equal(records[0].cvmCode, '10670');
  assert.equal(records[0].registrationSituation, 'ATIVO');
  assert.equal(records[0].registrationCategory, 'Categoria A');
  assert.equal(records[0].effectiveDate, '2005-05-23');
});

test('retries transient network failures before succeeding', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const response = await fetchCvmRegistryWithRetry('https://dados.cvm.gov.br/test.csv', {}, {
    attempts: 5,
    baseDelayMs: 10,
    timeoutMs: 1_000,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw new TypeError('fetch failed');
      return new Response('ok', { status: 200 });
    },
    sleepImpl: async (milliseconds) => { sleeps.push(milliseconds); },
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [10, 20]);
});

test('retries retryable HTTP responses and honors bounded Retry-After', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const response = await fetchCvmRegistryWithRetry('https://dados.cvm.gov.br/test.csv', {}, {
    attempts: 3,
    baseDelayMs: 10,
    timeoutMs: 1_000,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response('busy', { status: 503, headers: { 'retry-after': '1' } });
      return new Response('ok', { status: 200 });
    },
    sleepImpl: async (milliseconds) => { sleeps.push(milliseconds); },
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [1_000]);
});

test('does not retry deterministic client errors', async () => {
  let calls = 0;
  const response = await fetchCvmRegistryWithRetry('https://dados.cvm.gov.br/missing.csv', {}, {
    attempts: 5,
    baseDelayMs: 0,
    timeoutMs: 1_000,
    fetchImpl: async () => {
      calls += 1;
      return new Response('missing', { status: 404 });
    },
    sleepImpl: async () => undefined,
  });

  assert.equal(response.status, 404);
  assert.equal(calls, 1);
});

test('surfaces retry exhaustion with useful diagnostics', async () => {
  let calls = 0;
  await assert.rejects(
    () => fetchCvmRegistryWithRetry('https://dados.cvm.gov.br/test.csv', {}, {
      attempts: 3,
      baseDelayMs: 0,
      timeoutMs: 1_000,
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError('fetch failed', { cause: new Error('socket reset') });
      },
      sleepImpl: async () => undefined,
    }),
    /CVM registry request failed after 3 attempts: fetch failed <- socket reset/,
  );
  assert.equal(calls, 3);
});
