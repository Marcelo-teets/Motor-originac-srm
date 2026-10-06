import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../db/migrations/20261001190000_database_growth_circuit_breaker.sql', import.meta.url),
  'utf8',
);

test('growth guard protects only raw/heavy tables', () => {
  for (const table of [
    'monitoring_outputs',
    'source_documents',
    'capital_market_events',
    'bronze_historical_records',
  ]) {
    assert.match(sql, new RegExp("'" + table + "'"));
  }

  for (const protectedLayer of [
    'company_signals',
    'qualification_snapshots',
    'score_snapshots',
    'lead_score_snapshots',
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp("create trigger[^;]+on public\\." + protectedLayer, 'i'),
    );
  }
});

test('hard mode blocks growth but cleanup updates remain possible', () => {
  assert.match(sql, /status = 'block_raw'/);
  assert.match(sql, /database_growth_guard_block_raw/);
  assert.match(sql, /if tg_op = 'UPDATE' and v_new_bytes <= v_old_bytes then\s+return new;/i);
});

test('degraded mode bounds oversized rows', () => {
  assert.match(sql, /status = 'degraded'/);
  assert.match(sql, /degraded_max_row_bytes/);
  assert.match(sql, /database_growth_guard_oversized_raw_row/);
});

test('state refresh is bounded and cron-driven', () => {
  assert.match(sql, /checked_at < now\(\) - interval '30 minutes'/);
  assert.match(sql, /database-growth-guard-refresh/);
  assert.match(sql, /'11,41 \* \* \* \*'/);
});

test('guard remains non-destructive', () => {
  // Ignore `--` comments: the header documents "no DELETE/TRUNCATE/VACUUM FULL".
  const statements = sql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(statements, /\bdelete\s+from\b/i);
  assert.doesNotMatch(statements, /\btruncate\b/i);
  assert.doesNotMatch(statements, /vacuum\s+full/i);
});
