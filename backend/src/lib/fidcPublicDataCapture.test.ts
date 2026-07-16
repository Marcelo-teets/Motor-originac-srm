import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFidcPublicData, isFidcRelevantCompany } from './fidcPublicDataCapture.js';
import { companySeeds } from '../data/platformSeeds.js';
import type { SourceCatalogEntry } from '../types/platform.js';

const fidcSource: SourceCatalogEntry = {
  id: '2d9c5f70-ab43-4c8d-9f5e-3c4d5e6f8091',
  name: 'CVM FIDC: Documentos: Informe Mensal',
  sourceType: 'dataset_http',
  category: 'FIDC',
  status: 'real',
  health: 'healthy',
  metadata: { code: 'src_cvm_fidc_informe_mensal' },
};

const relevantCompany = {
  ...companySeeds[0]!,
  currentFundingStructure: 'FIDC próprio em estruturação',
  receivables: ['Duplicatas'],
};

const irrelevantCompany = {
  ...companySeeds[0]!,
  currentFundingStructure: 'Equity apenas',
  receivables: [],
};

const ckanPayload = {
  success: true,
  result: {
    id: 'abc-123',
    name: 'fidc-doc-inf_mensal',
    title: 'FIDC: Documentos: Informe Mensal',
    metadata_modified: '2026-07-01T00:00:00',
    resources: [
      { id: 'r1', name: 'inf_mensal_fidc_2026.zip', format: 'zip', url: 'https://dados.cvm.gov.br/r1.zip' },
    ],
  },
};

const withStubbedFetch = async (handler: () => Response | Promise<Response>, run: () => Promise<void>) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => handler()) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('isFidcRelevantCompany gates on funding structure or receivables', () => {
  assert.equal(isFidcRelevantCompany(relevantCompany), true);
  assert.equal(isFidcRelevantCompany(irrelevantCompany), false);
});

test('captureFidcPublicData emits output, signal and enrichment from CKAN payload', async () => {
  await withStubbedFetch(
    () => new Response(JSON.stringify(ckanPayload), { status: 200, headers: { 'content-type': 'application/json' } }),
    async () => {
      const bundle = await captureFidcPublicData(relevantCompany, [fidcSource], new Date().toISOString());

      assert.equal(bundle.outputs.length, 1);
      const output = bundle.outputs[0]!;
      assert.equal(output.sourceId, fidcSource.id);
      assert.equal(output.connectorStatus, 'real');
      assert.equal(output.normalizedPayload.datasetName, 'fidc-doc-inf_mensal');
      assert.equal(typeof output.normalizedPayload.sourceUrl, 'string');

      assert.equal(bundle.signals.length, 1);
      assert.equal(bundle.signals[0]!.signalType, 'fidc_dataset_update_signal');
      assert.equal(bundle.signals[0]!.sourceId, fidcSource.id);

      assert.equal(bundle.enrichments.length, 1);
      assert.equal(bundle.enrichments[0]!.enrichmentType, 'fidc_public_dataset_snapshot');
      assert.equal(bundle.enrichments[0]!.payload.sourceId, fidcSource.id);
    },
  );
});

test('captureFidcPublicData skips companies without FIDC relevance', async () => {
  const bundle = await captureFidcPublicData(irrelevantCompany, [fidcSource], new Date().toISOString());
  assert.deepEqual(bundle, { outputs: [], signals: [], enrichments: [] });
});

test('captureFidcPublicData skips when the source is absent or planned', async () => {
  const empty = await captureFidcPublicData(relevantCompany, [], new Date().toISOString());
  assert.deepEqual(empty, { outputs: [], signals: [], enrichments: [] });

  const planned = await captureFidcPublicData(relevantCompany, [{ ...fidcSource, status: 'planned' }], new Date().toISOString());
  assert.deepEqual(planned, { outputs: [], signals: [], enrichments: [] });
});

test('captureFidcPublicData falls back to partial when the fetch fails', async () => {
  await withStubbedFetch(
    () => {
      throw new Error('CKAN unavailable');
    },
    async () => {
      const bundle = await captureFidcPublicData(relevantCompany, [fidcSource], new Date().toISOString());
      assert.equal(bundle.outputs.length, 1);
      assert.equal(bundle.outputs[0]!.connectorStatus, 'partial');
      assert.equal(bundle.signals[0]!.signalStrength, 35);
    },
  );
});
