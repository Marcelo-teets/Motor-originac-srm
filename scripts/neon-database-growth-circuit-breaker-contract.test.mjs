import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../db/neon/20261001_neon_database_growth_circuit_breaker.sql', import.meta.url),
  'utf8',
);

test('Neon guard has no Supabase service_role dependency', () => {
  assert.doesNotMatch(sql, /\bservice_role\b/);
  assert.match(sql, /\bneondb_owner\b/);
  assert.match(sql, /\banonymous\b/);
  assert.match(sql, /\bauthenticated\b/);
});

test('Neon guard leaves headroom below 480MB quota', () => {
  assert.match(sql, /400000000/);
  assert.match(sql, /440000000/);
  assert.match(sql, /p_hard_limit_bytes >= 480000000/);
});

test('Neon guard covers raw-heavy surfaces and not decision layers', () => {
  for (const table of [
    'monitoring_outputs',
    'source_documents',
    'capital_market_events',
    'bronze_historical_records',
  ]) assert.match(sql, new RegExp("'" + table + "'"));

  for (const table of [
    'company_signals',
    'qualification_snapshots',
    'score_snapshots',
    'lead_score_snapshots',
    'ranking_v2',
  ]) {
    assert.doesNotMatch(sql, new RegExp("create trigger[^;]+on public\\." + table, 'i'));
  }
});

test('Neon guard supports shrinking cleanup and cron refresh', () => {
  assert.match(sql, /v_new_bytes <= v_old_bytes/);
  assert.match(sql, /create extension if not exists pg_cron/);
  assert.match(sql, /database-growth-guard-refresh/);
  assert.match(sql, /'11,41 \* \* \* \*'/);
});
