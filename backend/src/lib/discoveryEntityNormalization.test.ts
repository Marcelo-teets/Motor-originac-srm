import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDiscoveryEntityHits } from './discoveryEntityNormalization.js';
import type { DiscoverySourceHit } from './discoveryCapture.js';

const hit = (companyName: string): DiscoverySourceHit => ({
  companyName,
  sourceRef: 'src_neofeed_rss',
  sourceUrl: 'https://news.google.com/article',
  evidenceSummary: `${companyName} busca funding`,
  confidence: 0.62,
  rawPayload: { transportSourceRef: 'google-news-rss' },
});

test('strips generic company descriptors from a brand-only headline subject', () => {
  const result = normalizeDiscoveryEntityHits([hit('Fintech UY3')]);
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].companyName, 'UY3');
  assert.equal(result.rewritten, 1);
  assert.equal((result.hits[0].rawPayload.entityNormalization as { rule?: string }).rule, 'normalized_headline_subject');
});

test('rejects editorial labels before they become company candidates', () => {
  const result = normalizeDiscoveryEntityHits([
    hit('Entrevista'),
    hit('Podcast'),
    hit('Notícias'),
  ]);
  assert.equal(result.hits.length, 0);
  assert.equal(result.rejected, 3);
});

test('keeps genuine brands unchanged', () => {
  const result = normalizeDiscoveryEntityHits([hit('Open Co'), hit('CashGO')]);
  assert.deepEqual(result.hits.map((item) => item.companyName).sort(), ['CashGO', 'Open Co']);
  assert.equal(result.rejected, 0);
});
