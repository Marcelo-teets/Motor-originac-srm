import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchBrasilApiCompany, fetchMinhaReceitaCompany } from './connectors.js';

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
