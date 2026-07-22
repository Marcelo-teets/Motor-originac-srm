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

test('extractPortfolioCompanyNames recovers clean names from real production noise', () => {
  // Casos reais capturados na primeira execução em produção (portfólios
  // Kaszek/Canary): prefixo do fundo, sufixo "Logo", placeholder e manchetes.
  const noisyHtml = `
    <img alt="Kaszek Creditas Logo" />
    <img alt="Kaszek drconsulta Logo" />
    <img alt="Kaszek Camino Education" />
    <img alt="Image without alt" />
    <h3>Telepatia Raises $33M</h3>
    <h3>Comp Raises R$100M Series A</h3>
    <a href="/x">Get in touch</a>
    <a href="/y">People</a>
  `;
  const names = extractPortfolioCompanyNames(noisyHtml);
  assert.ok(names.includes('Creditas'), `expected Creditas, got ${names.join(', ')}`);
  assert.ok(names.includes('drconsulta'));
  assert.ok(names.includes('Camino Education'));
  assert.ok(names.includes('Telepatia'));
  assert.ok(names.includes('Comp'));
  // Ruído que deve ser eliminado por completo.
  assert.ok(!names.some((n) => /logo|image without alt|get in touch|^people$/i.test(n)), `noise leaked: ${names.join(', ')}`);
});

test('extractPortfolioCompanyNames drops residual nav/heading noise seen on live pages', () => {
  const html = `
    <h3>Inner AI launches Squad.com</h3>
    <a>let's keep in touch</a>
    <a>of us</a>
    <a>founders</a>
    <h3>SUMMIT</h3>
    <h3>CVM Regulation</h3>
    <img alt="Creditas Logo" />
  `;
  const names = extractPortfolioCompanyNames(html);
  assert.ok(names.includes('Inner AI'), `expected 'Inner AI', got ${names.join(', ')}`);
  assert.ok(names.includes('Creditas'));
  assert.ok(!names.some((n) => /keep in touch|^of us$|^founders$|^summit$|regulation/i.test(n)), `noise leaked: ${names.join(', ')}`);
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
