import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRediscoveryCandidateUpdate } from './candidateRediscoveryLineage.js';

test('rediscovery promotes a governed publisher without changing triage fields', () => {
  const update = buildRediscoveryCandidateUpdate(
    {
      id: 'candidate-1',
      dedupe_key: 'name:a55',
      candidate_status: 'captured',
      source_ref: 'google-news-rss',
      raw_payload: {
        title: 'a55 busca antecipação de recebíveis - Finsiders Brasil',
        corroboratingSources: ['google-news-rss'],
      },
    },
    {
      dedupeKey: 'name:a55',
      searchProfileId: 'profile-v12',
      searchProfileRunId: 'run-v12',
      sourceRef: 'src_finsiders_rss',
      sourceUrl: 'https://news.google.com/article',
      evidenceSummary: 'a55 busca antecipação de recebíveis - Finsiders Brasil',
      rawPayload: {
        publisherName: 'Finsiders Brasil',
        transportSourceRef: 'google-news-rss',
        publisherAttribution: {
          version: 'v11',
          matched: true,
          catalogSourceRef: 'src_finsiders_rss',
        },
        entityNormalization: { version: 'v11', normalizedCompanyName: 'a55' },
        relevanceGate: { version: 'v10', accepted: true },
        corroboratingSources: ['google-news-rss', 'src_finsiders_rss'],
      },
    },
    '2026-08-10T23:10:00.000Z',
  );

  assert.ok(update);
  assert.equal(update?.id, 'candidate-1');
  assert.equal(update?.source_ref, 'src_finsiders_rss');
  assert.equal(update?.raw_payload.publisherName, 'Finsiders Brasil');
  assert.deepEqual(update?.raw_payload.corroboratingSources, ['google-news-rss', 'src_finsiders_rss']);
  assert.deepEqual(update?.raw_payload.rediscovery, {
    version: 'v12',
    count: 1,
    lastSeenAt: '2026-08-10T23:10:00.000Z',
    lastSearchProfileId: 'profile-v12',
    lastSearchProfileRunId: 'run-v12',
    lastSourceRef: 'src_finsiders_rss',
  });
  assert.equal((update?.raw_payload.latestObservation as { publisherName?: string })?.publisherName, 'Finsiders Brasil');
  assert.equal('candidate_status' in (update ?? {}), false);
  assert.equal('company_id' in (update ?? {}), false);
});

test('rediscovery keeps an unknown publisher as transport lineage without inventing a source', () => {
  const update = buildRediscoveryCandidateUpdate(
    {
      id: 'candidate-goflux',
      dedupe_key: 'name:goflux',
      candidate_status: 'captured',
      source_ref: 'google-news-rss',
      raw_payload: {},
    },
    {
      dedupeKey: 'name:goflux',
      sourceRef: 'google-news-rss',
      evidenceSummary: 'goFlux lança FIDC - AgFeed',
      rawPayload: {
        publisherName: 'AgFeed',
        publisherAttribution: { version: 'v11', matched: false },
        transportSourceRef: 'google-news-rss',
      },
    },
    '2026-08-10T23:11:00.000Z',
  );

  assert.ok(update);
  assert.equal(update?.source_ref, undefined);
  assert.equal(update?.raw_payload.publisherName, 'AgFeed');
  assert.equal((update?.raw_payload.publisherAttribution as { matched?: boolean })?.matched, false);
});

test('rediscovery increments its audit counter while preserving the original payload', () => {
  const update = buildRediscoveryCandidateUpdate(
    {
      id: 'candidate-2',
      dedupe_key: 'name:credmei',
      candidate_status: 'deduped',
      source_ref: 'src_finsiders_rss',
      raw_payload: {
        originalField: 'preserve-me',
        rediscovery: { version: 'v12', count: 3, firstSeenAt: '2026-08-01T00:00:00Z' },
      },
    },
    {
      dedupeKey: 'name:credmei',
      searchProfileId: 'profile-v12',
      searchProfileRunId: 'run-v12-b',
      sourceRef: 'src_finsiders_rss',
      rawPayload: {
        publisherName: 'Finsiders Brasil',
        publisherAttribution: { version: 'v11', matched: true },
      },
    },
    '2026-08-10T23:12:00.000Z',
  );

  assert.ok(update);
  assert.equal(update?.raw_payload.originalField, 'preserve-me');
  assert.equal((update?.raw_payload.rediscovery as { count?: number })?.count, 4);
  assert.equal((update?.raw_payload.rediscovery as { firstSeenAt?: string })?.firstSeenAt, '2026-08-01T00:00:00Z');
});

test('discarded candidates are suppression records and are never refreshed or revived', () => {
  const update = buildRediscoveryCandidateUpdate(
    {
      id: 'candidate-bad',
      dedupe_key: 'name:tendencias',
      candidate_status: 'discarded',
      source_ref: 'google-news-rss',
      raw_payload: {},
    },
    {
      dedupeKey: 'name:tendencias',
      sourceRef: 'src_finsiders_rss',
      rawPayload: {
        publisherAttribution: { version: 'v11', matched: true },
      },
    },
    '2026-08-10T23:13:00.000Z',
  );

  assert.equal(update, null);
});
