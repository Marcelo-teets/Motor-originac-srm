import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MACRO_SERIES, fetchBcbSgsSeries, parseSeriesMetadata } from './bcbSgs.js';

const withStubbedFetch = async (handler: () => Response | Promise<Response>, run: () => Promise<void>) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => handler()) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('fetchBcbSgsSeries parses pt-BR decimal payload and exposes latest observation', async () => {
  await withStubbedFetch(
    () => new Response(JSON.stringify([
      { data: '14/07/2026', valor: '10,50' },
      { data: '15/07/2026', valor: '10,75' },
    ]), { status: 200, headers: { 'content-type': 'application/json' } }),
    async () => {
      const result = await fetchBcbSgsSeries({ code: 432, name: 'Selic meta', unit: '% a.a.' });
      assert.equal(result.observations.length, 2);
      assert.deepEqual(result.latest, { date: '15/07/2026', value: 10.75 });
    },
  );
});

test('fetchBcbSgsSeries rejects on http error and invalid payload', async () => {
  await withStubbedFetch(
    () => new Response('erro', { status: 500 }),
    async () => {
      await assert.rejects(() => fetchBcbSgsSeries({ code: 999999, name: 'x', unit: '' }), /status 500/);
    },
  );
  await withStubbedFetch(
    () => new Response(JSON.stringify({ nada: true }), { status: 200 }),
    async () => {
      await assert.rejects(() => fetchBcbSgsSeries({ code: 1, name: 'x', unit: '' }), /invalid payload/);
    },
  );
});

test('parseSeriesMetadata falls back to defaults and filters malformed entries', () => {
  assert.deepEqual(parseSeriesMetadata(undefined), DEFAULT_MACRO_SERIES);
  assert.deepEqual(parseSeriesMetadata([]), DEFAULT_MACRO_SERIES);
  assert.deepEqual(parseSeriesMetadata([{ code: 'abc' }]), DEFAULT_MACRO_SERIES);

  const custom = parseSeriesMetadata([{ code: 4189, name: 'Selic acumulada', unit: '% a.a.' }, { code: -1 }]);
  assert.deepEqual(custom, [{ code: 4189, name: 'Selic acumulada', unit: '% a.a.' }]);
});
