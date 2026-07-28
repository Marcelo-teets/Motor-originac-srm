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

const creditSource: SourceCatalogEntry = {
  id: 'f7de7493-3350-46d2-85aa-8f5c10647fad',
  name: 'BCB SGS Series Temporais de Credito',
  sourceType: 'api',
  category: 'credit_market',
  status: 'real',
  health: 'healthy',
  metadata: {
    code: 'src_bcb_sgs_credit_series',
    series: [{ code: 21082, name: 'Inadimplência da carteira de crédito - Total', unit: '%' }],
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

test('captureBcbSgsMacro persists catalog source id and caches source-wide fetches across companies', async () => {
  await withCountingFetch(async (calls) => {
    const [first, second] = await Promise.all([
      captureBcbSgsMacro(companySeeds[0]!, [sgsSource], '2026-07-28T15:00:00.000Z'),
      captureBcbSgsMacro(companySeeds[1] ?? companySeeds[0]!, [sgsSource], '2026-07-28T15:00:01.000Z'),
    ]);

    assert.equal(calls(), 1, 'company-agnostic series must be fetched once inside the cache window');

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

test('captureBcbSgsMacro activates the separate credit-cycle catalog source', async () => {
  await withCountingFetch(async (calls) => {
    const bundle = await captureBcbSgsMacro(
      companySeeds[0]!,
      [sgsSource, creditSource],
      '2026-07-28T15:05:00.000Z',
    );

    assert.equal(calls(), 1, 'macro source remains cached and only the new credit source is fetched');
    assert.equal(bundle.outputs.length, 2);
    assert.deepEqual(bundle.outputs.map((item) => item.sourceId).sort(), [creditSource.id, sgsSource.id].sort());
    assert.ok(bundle.signals.some((item) => item.signalType === 'macro_credit_cycle'));
    assert.ok(bundle.enrichments.some((item) => item.enrichmentType === 'credit_cycle_context'));
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
    const isolatedSource = { ...sgsSource, id: 'sgs-failure-isolated' };
    const bundle = await captureBcbSgsMacro(companySeeds[0]!, [isolatedSource], new Date().toISOString());
    assert.equal(bundle.outputs[0]!.connectorStatus, 'partial');
    assert.equal(bundle.signals[0]!.signalStrength, 30);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
