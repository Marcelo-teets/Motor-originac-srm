import test from 'node:test';
import assert from 'node:assert/strict';
import { captureBcbSgsMacro } from './bcbSgsCapture.js';
import { companySeeds } from '../data/platformSeeds.js';
import type { SourceCatalogEntry } from '../types/platform.js';

const sgsSource: SourceCatalogEntry = {
  id: '3e0d6a81-bc54-4d9e-a06f-4d5e6f708192',
  name: 'Banco Central SGS Macro Series',
  sourceType: 'api',
  category: 'macro_context',
  status: 'real',
  health: 'healthy',
  metadata: {
    code: 'src_bcb_sgs',
    series: [{ code: 432, name: 'Selic meta', unit: '% a.a.' }],
  },
};

const sgsPayload = JSON.stringify([{ data: '15/07/2026', valor: '10,75' }]);

const withCountingFetch = async (run: (calls: () => number) => Promise<void>) => {
  const originalFetch = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => {
    count += 1;
    return new Response(sgsPayload, { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    await run(() => count);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('captureBcbSgsMacro persists catalog source id and memoizes fetches per run', async () => {
  await withCountingFetch(async (calls) => {
    const collectedAt = new Date().toISOString();
    const [first, second] = await Promise.all([
      captureBcbSgsMacro(companySeeds[0]!, [sgsSource], collectedAt),
      captureBcbSgsMacro(companySeeds[1] ?? companySeeds[0]!, [sgsSource], collectedAt),
    ]);

    assert.equal(calls(), 1, 'series fetch must run once per engine run, not per company');

    for (const bundle of [first, second]) {
      assert.equal(bundle.outputs.length, 1);
      assert.equal(bundle.outputs[0]!.sourceId, sgsSource.id);
      assert.equal(bundle.outputs[0]!.connectorStatus, 'real');
      assert.equal(bundle.outputs[0]!.normalizedPayload.sourceCode, 'src_bcb_sgs');
      assert.equal(bundle.signals[0]!.signalType, 'macro_indexer_context');
      assert.equal(bundle.signals[0]!.sourceId, sgsSource.id);
      assert.equal(bundle.enrichments[0]!.enrichmentType, 'macro_credit_context');
      assert.equal(bundle.enrichments[0]!.payload.sourceId, sgsSource.id);
    }
  });
});

test('captureBcbSgsMacro returns empty bundle without a runtime source', async () => {
  const empty = await captureBcbSgsMacro(companySeeds[0]!, [], new Date().toISOString());
  assert.deepEqual(empty, { outputs: [], signals: [], enrichments: [] });

  const planned = await captureBcbSgsMacro(companySeeds[0]!, [{ ...sgsSource, status: 'planned' }], new Date().toISOString());
  assert.deepEqual(planned, { outputs: [], signals: [], enrichments: [] });
});

test('captureBcbSgsMacro degrades to partial when every series fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  try {
    const bundle = await captureBcbSgsMacro(companySeeds[0]!, [sgsSource], new Date().toISOString());
    assert.equal(bundle.outputs[0]!.connectorStatus, 'partial');
    assert.equal(bundle.signals[0]!.signalStrength, 30);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
