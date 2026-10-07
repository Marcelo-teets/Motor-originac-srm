import assert from 'node:assert/strict';
import test from 'node:test';
import { scrapeCompanyWebsiteDeep } from './companyWebsiteDeepScraper.js';

const html = (title: string) => `<html><head><title>${title}</title></head><body><h1>${title}</h1></body></html>`;

test('classifies candidate pages by path and only the bare site as homepage', async (t) => {
  let inFlight = 0;
  let peak = 0;
  t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight -= 1;
    const { pathname } = new URL(String(input));
    if (!['/', '/about', '/careers', '/blog'].includes(pathname)) return new Response('missing', { status: 404 });
    return new Response(html(`page ${pathname}`), { status: 200, headers: { 'content-type': 'text/html' } });
  });

  const result = await scrapeCompanyWebsiteDeep({ companyId: 'c1', companyName: 'News Corp', website: 'newscorp.example' });
  const types = Object.fromEntries(result.pages.map((page) => [new URL(page.url).pathname, page.pageType]));
  assert.deepEqual(types, { '/': 'homepage', '/about': 'about', '/careers': 'careers', '/blog': 'newsroom' });
  assert.ok(peak <= 5, `at most 5 concurrent fetches, saw ${peak}`);
});

test('skips pages whose declared body exceeds the size cap', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(html('huge'), {
    status: 200,
    headers: { 'content-length': String(10_000_000) },
  }));
  const result = await scrapeCompanyWebsiteDeep({ companyId: 'c1', companyName: 'Acme', website: 'https://acme.example/' });
  assert.equal(result.pages.length, 0);
  assert.equal(result.connectorStatus, 'partial');
});
