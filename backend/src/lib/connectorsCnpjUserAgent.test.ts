import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchBrasilApiCompany, fetchMinhaReceitaCompany, fetchCnpjWsPublicCompany, preparePublicRegistryCnpjLookup } from './connectors.js';

test('Brazilian CNPJ proxy calls identify Motor honestly; never spoof a browser', async () => {
  const originalFetch = globalThis.fetch;
  const visited: string[] = [];
  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const agent = headers.get('user-agent') ?? '';
      assert.match(agent, /^MotorOriginationIntelligence\/1\.0/);
      assert.doesNotMatch(agent, /Mozilla|Chrome|Safari/);
      assert.equal(headers.get('accept'), 'application/json');
      visited.push(url);
      return new Response(JSON.stringify({
        cnpj: '19540550000121',
        razao_social: 'EMPRESA PUBLICA DE TESTE DE CNPJ LTDA',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const primary = await fetchBrasilApiCompany('19.540.550/0001-21');
    const fallback = await fetchMinhaReceitaCompany('19.540.550/0001-21');
    assert.equal(primary.status, 'real');
    assert.equal(fallback.status, 'real');
    assert.deepEqual(visited, [
      'https://brasilapi.com.br/api/cnpj/v1/19540550000121',
      'https://minhareceita.org/19540550000121',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('RFB-2026 alphanumeric CNPJ never becomes a truncated provider request or observed identity', async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    throw new Error('Network access must not happen for unsupported lookup');
  }) as typeof fetch;
  try {
    const officialExample = '00.000.000/E08G-12';
    const prepared = preparePublicRegistryCnpjLookup(officialExample);
    assert.deepEqual(prepared, {
      normalized: '00000000E08G12',
      blockedReason: 'provider_alphanumeric_support_unverified',
    });
    const responses = await Promise.all([
      fetchBrasilApiCompany(officialExample),
      fetchMinhaReceitaCompany(officialExample),
      fetchCnpjWsPublicCompany(officialExample),
    ]);
    assert.deepEqual(requests, [], 'never query a numeric substring of an alphanumeric CNPJ');
    for (const result of responses) {
      assert.equal(result.status, 'partial');
      assert.equal(result.data.cnpj, '00000000E08G12');
      assert.equal(result.data.error, 'provider_alphanumeric_support_unverified');
      assert.equal('providerCallSkipped' in result.data && result.data.providerCallSkipped, true);
      assert.match(result.endpoint, /00000000E08G12$/);
      assert.doesNotMatch(result.endpoint, /000000000012$/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invalid checksum and malformed numeric CNPJ are refused before provider requests', async () => {
  const originalFetch = globalThis.fetch;
  let attemptedFetches = 0;
  globalThis.fetch = (async () => {
    attemptedFetches++;
    throw new Error('Unexpected public-registry lookup');
  }) as typeof fetch;
  try {
    for (const malformed of ['19.540.550/0001-22', '00.000.000/E08G-13', 'bad-cnpj']) {
      const results = await Promise.all([
        fetchBrasilApiCompany(malformed),
        fetchMinhaReceitaCompany(malformed),
        fetchCnpjWsPublicCompany(malformed),
      ]);
      for (const result of results) {
        assert.equal(result.status, 'partial');
        assert.equal(result.data.error, 'invalid_cnpj_identity');
        assert.equal('providerCallSkipped' in result.data && result.data.providerCallSkipped, true);
      }
    }
    assert.equal(attemptedFetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('existing valid numeric CNPJ remains lookup-compatible on CNPJws', async () => {
  const originalFetch = globalThis.fetch;
  const called: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    called.push(String(input));
    return new Response(JSON.stringify({ estabelecimento: { cnpj: '19540550000121' } }), { status: 200 });
  }) as typeof fetch;
  try {
    const response = await fetchCnpjWsPublicCompany('19.540.550/0001-21');
    assert.equal(response.status, 'real');
    assert.deepEqual(called, ['https://publica.cnpj.ws/cnpj/19540550000121']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
