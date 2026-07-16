import test from 'node:test';
import assert from 'node:assert/strict';
import { captureOriginationScrapers } from './originationScraperCapture.js';
import { companySeeds } from '../../data/platformSeeds.js';
import type { SourceCatalogEntry } from '../../types/platform.js';

const company = { ...companySeeds[0]!, website: 'https://example.com' };

// Prod-shaped catalog rows: UUID id + logical identity in metadata.code.
const websiteDeepSource: SourceCatalogEntry = {
  id: '0b9a3d5e-8f21-4f6a-9d3c-1a2b3c4d5e6f',
  name: 'Company Website Deep Scraper',
  sourceType: 'scraper',
  category: 'company_site',
  status: 'real',
  health: 'healthy',
  metadata: { code: 'src_company_website_deep' },
};

const professionalNetworkSource: SourceCatalogEntry = {
  id: '1c8b4e6f-9a32-4b7c-8e4d-2b3c4d5e6f70',
  name: 'Professional Network Company Profile',
  sourceType: 'scraper',
  category: 'professional_network',
  status: 'partial',
  health: 'degraded',
  metadata: { code: 'src_professional_network_company', baseUrl: 'https://www.linkedin.com' },
};

const htmlWithCreditKeywords = `
  <html><head><title>Crédito para empresas</title></head>
  <body><h1>Antecipação de recebíveis</h1>
  <p>Financiamento e capital de giro com antecipação de recebíveis de duplicata para empresas B2B.</p>
  </body></html>
`;

const withStubbedFetch = async (handler: (url: string) => Response | Promise<Response>, run: () => Promise<void>) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('captureOriginationScrapers persists catalog source ids and aggregates signals', async () => {
  await withStubbedFetch(
    () => new Response(htmlWithCreditKeywords, { status: 200, headers: { 'content-type': 'text/html' } }),
    async () => {
      const bundle = await captureOriginationScrapers(company, [websiteDeepSource, professionalNetworkSource], new Date().toISOString());

      assert.equal(bundle.outputs.length, 2);
      const outputSourceIds = new Set(bundle.outputs.map((output) => output.sourceId));
      assert.ok(outputSourceIds.has(websiteDeepSource.id));
      assert.ok(outputSourceIds.has(professionalNetworkSource.id));

      assert.ok(bundle.signals.length > 0);
      for (const signal of bundle.signals) {
        assert.ok([websiteDeepSource.id, professionalNetworkSource.id].includes(signal.sourceId ?? ''));
        assert.notEqual(signal.sourceId, 'src_linkedin_company_page');
      }

      // Signal families must be aggregated: no duplicated type per source.
      const websiteSignalTypes = bundle.signals
        .filter((signal) => signal.sourceId === websiteDeepSource.id)
        .map((signal) => signal.signalType);
      assert.equal(new Set(websiteSignalTypes).size, websiteSignalTypes.length);
      assert.ok(websiteSignalTypes.length <= 8);
      assert.ok(websiteSignalTypes.includes('receivables_signal'));

      for (const output of bundle.outputs) {
        assert.equal(typeof output.normalizedPayload.sourceUrl, 'string');
        assert.equal(typeof output.normalizedPayload.sourceCode, 'string');
        assert.equal(typeof output.normalizedPayload.timestamp, 'string');
      }
    },
  );
});

test('captureOriginationScrapers returns empty bundle without registered sources', async () => {
  const bundle = await captureOriginationScrapers(company, [], new Date().toISOString());
  assert.deepEqual(bundle, { outputs: [], signals: [], enrichments: [] });
});

test('captureOriginationScrapers ignores planned sources', async () => {
  const planned = [
    { ...websiteDeepSource, status: 'planned' as const },
    { ...professionalNetworkSource, status: 'planned' as const },
  ];
  const bundle = await captureOriginationScrapers(company, planned, new Date().toISOString());
  assert.deepEqual(bundle, { outputs: [], signals: [], enrichments: [] });
});

test('captureOriginationScrapers degrades to partial output when fetches fail', async () => {
  await withStubbedFetch(
    () => {
      throw new Error('network down');
    },
    async () => {
      const bundle = await captureOriginationScrapers(company, [websiteDeepSource, professionalNetworkSource], new Date().toISOString());
      assert.equal(bundle.outputs.length, 2);
      for (const output of bundle.outputs) {
        assert.equal(output.connectorStatus, 'partial');
      }
      assert.equal(bundle.signals.length, 0);
    },
  );
});
