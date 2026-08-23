import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeUpsertRows, fetchSupabaseWithRetry, getSupabaseRetryDefaults } from './supabase.js';

test('dedupeUpsertRows keeps the last row for the same conflict identity', () => {
  const rows = dedupeUpsertRows([
    { dataset_code: 'cvm_offers', record_key: 'same', status: 'first' },
    { dataset_code: 'cvm_offers', record_key: 'other', status: 'only' },
    { dataset_code: 'cvm_offers', record_key: 'same', status: 'latest' },
  ], 'dataset_code,record_key') as Array<Record<string, unknown>>;

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find((row) => row.record_key === 'same'), {
    dataset_code: 'cvm_offers',
    record_key: 'same',
    status: 'latest',
  });
});

test('dedupeUpsertRows does not collapse rows with null conflict values', () => {
  const rows = dedupeUpsertRows([
    { dataset_code: 'cvm_offers', record_key: null, status: 'first' },
    { dataset_code: 'cvm_offers', record_key: null, status: 'second' },
  ], 'dataset_code,record_key');

  assert.equal(rows.length, 2);
});

test('dedupeUpsertRows preserves payload when no conflict target is provided', () => {
  const input = [{ id: 1 }, { id: 1 }];
  assert.equal(dedupeUpsertRows(input), input);
});

test('fetchSupabaseWithRetry recovers from a transient network failure', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    if (calls === 1) {
      const cause = Object.assign(new Error('socket disconnected'), { code: 'UND_ERR_SOCKET' });
      throw new TypeError('fetch failed', { cause });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;

  const response = await fetchSupabaseWithRetry('https://example.supabase.co/rest/v1/test', {}, {
    attempts: 3,
    baseDelayMs: 0,
    fetchImpl,
    sleepImpl: async () => undefined,
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('fetchSupabaseWithRetry retries a temporary gateway response', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return calls === 1
      ? new Response('temporarily unavailable', { status: 503 })
      : new Response('[]', { status: 200 });
  }) as typeof fetch;

  const response = await fetchSupabaseWithRetry('https://example.supabase.co/rest/v1/test', {}, {
    attempts: 2,
    baseDelayMs: 0,
    fetchImpl,
    sleepImpl: async () => undefined,
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('fetchSupabaseWithRetry treats Cloudflare 521/522 as transient outside fail-fast overrides', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return calls === 1
      ? new Response('origin unavailable', { status: 522 })
      : new Response('[]', { status: 200 });
  }) as typeof fetch;

  const response = await fetchSupabaseWithRetry('https://example.supabase.co/rest/v1/test', {}, {
    attempts: 2,
    baseDelayMs: 0,
    fetchImpl,
    sleepImpl: async () => undefined,
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('fetchSupabaseWithRetry does not retry deterministic PostgREST database errors', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      code: '21000',
      message: 'ON CONFLICT DO UPDATE command cannot affect row a second time',
    }), { status: 500, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const response = await fetchSupabaseWithRetry('https://example.supabase.co/rest/v1/test', {}, {
    attempts: 4,
    baseDelayMs: 0,
    fetchImpl,
    sleepImpl: async () => undefined,
  });

  assert.equal(response.status, 500);
  assert.equal(calls, 1);
});

test('Vercel Supabase defaults stay below the serverless request budget', () => {
  const previousVercel = process.env.VERCEL;
  const previousVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL = '1';
  delete process.env.VERCEL_ENV;

  try {
    const defaults = getSupabaseRetryDefaults();
    assert.deepEqual(defaults, { attempts: 1, timeoutMs: 5_000, baseDelayMs: 0 });
    assert.ok((defaults.attempts * defaults.timeoutMs) + defaults.baseDelayMs < 25_000);
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
  }
});

test('non-Vercel Supabase defaults preserve robust worker retries', () => {
  const previousVercel = process.env.VERCEL;
  const previousVercelEnv = process.env.VERCEL_ENV;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;

  try {
    assert.deepEqual(getSupabaseRetryDefaults(), { attempts: 5, timeoutMs: 60_000, baseDelayMs: 500 });
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
  }
});
