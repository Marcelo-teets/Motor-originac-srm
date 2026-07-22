import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestFreeOfficialCompanySources } from './freeOfficialDataSources.js';
import type { CompanySeed, SourceCatalogEntry } from '../../types/platform.js';

const company: CompanySeed = {
  id: 'company_test',
  legalName: 'Empresa Teste S.A.',
  tradeName: 'Empresa Teste',
  cnpj: '12345678000190',
  website: 'https://empresa.com.br',
  geography: 'Brasil',
  segment: 'Fintech',
  subsegment: 'Crédito',
  companyType: 'Scale-up',
  stage: 'Growth',
  creditProduct: 'Capital de giro',
  receivables: ['Duplicatas'],
  currentFundingStructure: 'Bancos',
  description: 'Empresa de teste',
  signals: [],
  monitoring: {
    status: 'queued',
    lastRunAt: '',
    outputs24h: 0,
    triggers24h: 0,
    websiteChanges: [],
    feedHighlights: [],
  },
  enrichment: {
    governanceMaturity: 'medium',
    underwritingMaturity: 'medium',
    operationalMaturity: 'medium',
    riskModelMaturity: 'medium',
    unitEconomicsQuality: 'mixed',
    spreadVsFundingQuality: 'neutral',
    concentrationRisk: 'medium',
    delinquencySignal: 'low',
    sourceConfidence: 0.5,
    sourceNotes: [],
  },
  sourceRecords: [],
  marketMapPeers: [],
  activities: [],
};

const source = (code: string): SourceCatalogEntry => ({
  id: code,
  name: code,
  sourceType: 'api',
  category: 'test',
  status: 'real',
  health: 'healthy',
  metadata: { code },
});

test('does not call public APIs when direct sources are disabled', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error('unexpected fetch');
  }) as typeof fetch;

  try {
    const result = await ingestFreeOfficialCompanySources(company, [], '2026-07-21T12:00:00.000Z');
    assert.equal(calls, 0);
    assert.deepEqual(result.outputs, []);
    assert.deepEqual(result.signals, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('captures Wayback, Common Crawl and GitHub public evidence', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);

    if (url.startsWith('https://web.archive.org/cdx/')) {
      return new Response(JSON.stringify([
        ['timestamp', 'original', 'digest', 'statuscode'],
        ['20260701120000', 'https://empresa.com.br/produtos', 'digest-1', '200'],
        ['20260101120000', 'https://empresa.com.br/', 'digest-2', '200'],
      ]), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url === 'https://index.commoncrawl.org/collinfo.json') {
      return new Response(JSON.stringify([
        { id: 'CC-MAIN-2026-30', 'cdx-api': 'https://index.commoncrawl.org/CC-MAIN-2026-30-index' },
      ]), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url.startsWith('https://index.commoncrawl.org/CC-MAIN-2026-30-index')) {
      return new Response([
        JSON.stringify({ timestamp: '20260701', url: 'https://empresa.com.br/', digest: 'cc-1', filename: 'file-1', offset: '1', length: '100' }),
        JSON.stringify({ timestamp: '20260601', url: 'https://empresa.com.br/api', digest: 'cc-2', filename: 'file-2', offset: '2', length: '120' }),
      ].join('\n'), { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
    }

    if (url.startsWith('https://api.github.com/search/repositories')) {
      return new Response(JSON.stringify({
        items: [{
          full_name: 'empresa/api-publica',
          html_url: 'https://github.com/empresa/api-publica',
          description: 'SDK da Empresa Teste',
          homepage: 'https://empresa.com.br/developers',
          pushed_at: '2026-07-01T12:00:00Z',
          updated_at: '2026-07-01T12:00:00Z',
          stargazers_count: 10,
          forks_count: 2,
          archived: false,
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const result = await ingestFreeOfficialCompanySources(company, [
      source('src_wayback_company_history'),
      source('src_common_crawl_company_history'),
      source('src_github_public_api'),
    ], '2026-07-21T12:00:00.000Z');

    assert.equal(result.outputs.length, 3);
    assert.equal(result.signals.length, 3);
    assert.ok(result.signals.some((item) => item.signalType === 'technical_product_signal'));
    assert.ok(result.signals.some((item) => item.signalType === 'product_expansion_signal'));
    assert.ok(result.outputs.every((item) => item.normalizedPayload.accessMode === 'public_free'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
