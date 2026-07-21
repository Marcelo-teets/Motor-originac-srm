import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverVcPortfolioCompanies, extractPortfolioCompanyNames } from './vcPortfolioDiscovery.js';
import { DEFAULT_VC_PORTFOLIOS } from './vcPortfolios.js';

const portfolioHtml = `
  <html><body>
    <nav><a href="/">Home</a><a href="/about">About us</a><a href="/portfolio">Portfolio</a></nav>
    <h2>Companies</h2>
    <div class="card"><img src="/l1.png" alt="Pagora Pagamentos" /><h3>Pagora Pagamentos</h3></div>
    <div class="card"><img src="/l2.png" alt="CrediFlux" /><h3>CrediFlux</h3></div>
    <div class="card"><a href="/companies/finlog">Finlog</a></div>
    <img src="/deco.png" alt="logo" />
    <a href="/more">Ver mais</a>
    <h3>Newsletter</h3>
  </body></html>
`;

test('extractPortfolioCompanyNames extracts card names and drops navigation noise', () => {
  const names = extractPortfolioCompanyNames(portfolioHtml);
  assert.deepEqual(names, ['Pagora Pagamentos', 'CrediFlux', 'Finlog']);
});

test('extractPortfolioCompanyNames handles empty and junk html', () => {
  assert.deepEqual(extractPortfolioCompanyNames(''), []);
  assert.deepEqual(extractPortfolioCompanyNames('<p>12345</p><img alt="{{placeholder}}" />'), []);
});

test('discoverVcPortfolioCompanies builds review-ready hits from portfolio pages', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(portfolioHtml, { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch;
  try {
    const hits = await discoverVcPortfolioCompanies();

    assert.equal(hits.length, DEFAULT_VC_PORTFOLIOS.length * 3);
    const first = hits[0]!;
    assert.equal(first.companyName, 'Pagora Pagamentos');
    assert.match(first.sourceRef, /^vc-portfolio:/);
    assert.equal(first.confidence, 0.55);
    assert.equal(first.rawPayload.origin, 'vc_portfolio_page');
    assert.ok(typeof first.sourceUrl === 'string' && first.sourceUrl.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('discoverVcPortfolioCompanies returns empty on network failure', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  try {
    assert.deepEqual(await discoverVcPortfolioCompanies(), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
