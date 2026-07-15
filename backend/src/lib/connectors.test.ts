import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRssFeed, monitorCompanyWebsite } from './connectors.js';

const withMockFetch = async (mock: typeof fetch, action: () => Promise<void>) => {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await action();
  } finally {
    globalThis.fetch = original;
  }
};

test('fetchRssFeed unwraps CDATA and keeps useful business content', async () => {
  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title><![CDATA[Empresa anuncia FIDC]]></title>
    <link>https://example.com/noticia</link>
    <pubDate>Mon, 13 Jul 2026 10:00:00 GMT</pubDate>
    <description><![CDATA[Carteira de recebíveis financiará a expansão.]]></description>
  </item></channel></rss>`;

  await withMockFetch(async () => new Response(xml, { status: 200 }), async () => {
    const result = await fetchRssFeed('https://example.com/feed.xml');
    assert.equal(result.status, 'real');
    assert.equal(result.items[0]?.title, 'Empresa anuncia FIDC');
    assert.match(result.items[0]?.description ?? '', /recebíveis/);
  });
});

test('fetchRssFeed marks HTTP 200 without useful items as partial', async () => {
  await withMockFetch(async () => new Response('<rss><channel /></rss>', { status: 200 }), async () => {
    const result = await fetchRssFeed('https://example.com/empty.xml');
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.items, []);
    assert.equal(result.error, 'empty_feed');
  });
});

test('fetchRssFeed does not invent a publication timestamp when pubDate is absent', async () => {
  const xml = '<rss><channel><item><title>Empresa anuncia expansão</title><description>Nova carteira de recebíveis.</description></item></channel></rss>';
  await withMockFetch(async () => new Response(xml, { status: 200 }), async () => {
    const result = await fetchRssFeed('https://example.com/no-date.xml');
    assert.equal(result.status, 'real');
    assert.equal(result.items[0]?.publishedAt, undefined);
  });
});

test('monitorCompanyWebsite does not declare an empty HTTP 200 page as evidence', async () => {
  await withMockFetch(async () => new Response('<html><title></title></html>', { status: 200 }), async () => {
    const result = await monitorCompanyWebsite('https://example.com');
    assert.equal(result.status, 'partial');
    assert.equal(result.bodyText, '');
  });
});
