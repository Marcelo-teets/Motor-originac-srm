import test from 'node:test';
import assert from 'node:assert/strict';
import { captureVcPortfolios } from './vcPortfolioCapture.js';
import { parsePortfoliosMetadata, DEFAULT_VC_PORTFOLIOS } from './vcPortfolios.js';
import { companySeeds } from '../data/platformSeeds.js';
import type { CompanySeed, SourceCatalogEntry } from '../types/platform.js';

const company = companySeeds[0]!;

const source: SourceCatalogEntry = {
  id: '6b3f9db4-ef87-4ac1-b392-708192031425',
  name: 'VC Portfolio Monitor Brasil',
  sourceType: 'website',
  category: 'vc_portfolio',
  status: 'real',
  health: 'healthy',
  metadata: {
    code: 'src_vc_portfolio_monitor',
    portfolios: [{ fund: 'Fundo Teste', url: 'https://fundoteste.example/portfolio' }],
  },
};

const portfolioHtmlWith = (name: string) => `
  <html><body><h1>Portfolio</h1>
  <ul><li>Alpha Fintech</li><li>${name}</li><li>Beta Pay</li></ul>
  </body></html>
`;

const withStubbedFetch = async (html: string | null, run: (calls: () => number) => Promise<void>) => {
  const originalFetch = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => {
    count += 1;
    if (html === null) throw new Error('network down');
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
  try {
    await run(() => count);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('parsePortfoliosMetadata falls back to defaults and validates entries', () => {
  assert.deepEqual(parsePortfoliosMetadata(undefined), DEFAULT_VC_PORTFOLIOS);
  assert.deepEqual(parsePortfoliosMetadata([{ fund: 'X', url: 'not-a-url' }]), DEFAULT_VC_PORTFOLIOS);
  assert.deepEqual(
    parsePortfoliosMetadata([{ fund: 'Fundo Teste', url: 'https://x.example/p' }]),
    [{ fund: 'Fundo Teste', url: 'https://x.example/p' }],
  );
});

test('captureVcPortfolios emits venture_backed with catalog source id on a concrete match', async () => {
  await withStubbedFetch(portfolioHtmlWith(company.tradeName), async () => {
    const bundle = await captureVcPortfolios(company, [source], new Date().toISOString());

    assert.equal(bundle.outputs.length, 1);
    assert.equal(bundle.outputs[0]!.sourceId, source.id);
    assert.equal(bundle.outputs[0]!.normalizedPayload.fundName, 'Fundo Teste');
    assert.equal(bundle.outputs[0]!.normalizedPayload.evidenceUrl, 'https://fundoteste.example/portfolio');

    assert.equal(bundle.signals.length, 1);
    assert.equal(bundle.signals[0]!.signalType, 'venture_backed');
    assert.equal(bundle.signals[0]!.sourceId, source.id);

    assert.equal(bundle.enrichments.length, 1);
    assert.equal(bundle.enrichments[0]!.enrichmentType, 'vc_portfolio_presence');
  });
});

test('captureVcPortfolios memoizes portfolio fetches across companies in the same run', async () => {
  await withStubbedFetch(portfolioHtmlWith(company.tradeName), async (calls) => {
    const collectedAt = new Date().toISOString();
    await Promise.all([
      captureVcPortfolios(company, [source], collectedAt),
      captureVcPortfolios(companySeeds[1] ?? company, [source], collectedAt),
    ]);
    assert.equal(calls(), 1, 'portfolio pages must be fetched once per run');
  });
});

test('captureVcPortfolios stays silent without a concrete match', async () => {
  await withStubbedFetch(portfolioHtmlWith('Outra Empresa Qualquer'), async () => {
    const bundle = await captureVcPortfolios(company, [source], new Date().toISOString());
    assert.deepEqual(bundle, { outputs: [], signals: [], enrichments: [] });
  });
});

test('captureVcPortfolios never matches on short names', async () => {
  const shortNamed: CompanySeed = { ...company, tradeName: 'Neo', legalName: 'Neo' };
  await withStubbedFetch(portfolioHtmlWith('Neo'), async () => {
    const bundle = await captureVcPortfolios(shortNamed, [source], new Date().toISOString());
    assert.deepEqual(bundle, { outputs: [], signals: [], enrichments: [] });
  });
});

test('captureVcPortfolios stays silent on network failure and without sources', async () => {
  await withStubbedFetch(null, async () => {
    const bundle = await captureVcPortfolios(company, [source], new Date().toISOString());
    assert.deepEqual(bundle, { outputs: [], signals: [], enrichments: [] }, 'fetch errors must never become signals');
  });

  const empty = await captureVcPortfolios(company, [], new Date().toISOString());
  assert.deepEqual(empty, { outputs: [], signals: [], enrichments: [] });

  const planned = await captureVcPortfolios(company, [{ ...source, status: 'planned' }], new Date().toISOString());
  assert.deepEqual(planned, { outputs: [], signals: [], enrichments: [] });
});
