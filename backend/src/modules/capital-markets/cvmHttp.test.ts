import assert from 'node:assert/strict';
import test from 'node:test';
import { CVM_DATASETS, selectDatasetResources } from './cvmDatasetRegistry.js';
import { describeCvmFetchError, fetchCvmWithRetry } from './cvmHttp.js';

test('fetchCvmWithRetry recovers from transient network failures', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    if (calls < 3) {
      const cause = Object.assign(new Error('remote socket closed'), { code: 'UND_ERR_SOCKET' });
      throw new TypeError('fetch failed', { cause });
    }
    return new Response('{"success":true}', { status: 200 });
  }) as typeof fetch;

  const response = await fetchCvmWithRetry('https://dados.cvm.gov.br/test', {}, {
    attempts: 4,
    baseDelayMs: 0,
    fetchImpl,
    sleepImpl: async () => undefined,
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 3);
});

test('fetchCvmWithRetry retries temporary HTTP responses', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return calls === 1
      ? new Response('temporarily unavailable', { status: 503 })
      : new Response('ok', { status: 200 });
  }) as typeof fetch;

  const response = await fetchCvmWithRetry('https://dados.cvm.gov.br/test', {}, {
    attempts: 2,
    baseDelayMs: 0,
    fetchImpl,
    sleepImpl: async () => undefined,
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('describeCvmFetchError preserves nested network cause', () => {
  const cause = Object.assign(new Error('socket disconnected'), { code: 'UND_ERR_SOCKET' });
  const error = new TypeError('fetch failed', { cause });
  assert.match(describeCvmFetchError(error), /fetch failed.*socket disconnected.*UND_ERR_SOCKET/);
});

test('resource selection excludes CVM data dictionaries', () => {
  const selected = selectDatasetResources(CVM_DATASETS.cvm_offers, [
    {
      name: 'Dicionário de Dados - Ofertas de Distribuição',
      url: 'https://dados.cvm.gov.br/dados/OFERTA/DISTRIB/META/dicionario_oferta_distribuicao.zip',
      last_modified: '2026-07-20',
    },
    {
      name: 'Ofertas Resolução 160',
      url: 'https://dados.cvm.gov.br/dados/OFERTA/DISTRIB/DADOS/oferta_resolucao_160.csv',
      last_modified: '2026-07-19',
    },
  ]);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].name, 'Ofertas Resolução 160');
});
