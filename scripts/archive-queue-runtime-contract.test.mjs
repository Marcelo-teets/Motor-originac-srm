import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, cursorIndexMigration] = await Promise.all([
  readFile(
    new URL('../db/migrations/20260803144000_archive_queue_runtime_hardening.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../db/migrations/20260803180500_archive_cursor_index_fix.sql', import.meta.url),
    'utf8',
  ),
]);

const queueFunction = migration.slice(
  migration.indexOf('create or replace function private.queue_due_historical_excel_archives()'),
);

test('archive queue has partial indexes for due-date checks, cursor pagination and active runs', () => {
  assert.match(migration, /idx_capital_market_events_archive_dataset_due/);
  assert.match(migration, /\(dataset_code, observed_at, record_key\)/);
  assert.match(cursorIndexMigration, /idx_capital_market_events_archive_dataset_cursor/);
  assert.match(cursorIndexMigration, /\(dataset_code, record_key\)/);
  assert.match(cursorIndexMigration, /include \(observed_at\)/i);
  assert.match(cursorIndexMigration, /where raw_payload <> '\{\}'::jsonb\s+or normalized_payload <> '\{\}'::jsonb/);
  assert.match(migration, /idx_data_archive_runs_active_updated/);
  assert.match(migration, /idx_data_archive_tokens_active_run/);
});

test('archive queue expires abandoned runs only after tokens are no longer live', () => {
  assert.match(migration, /expire_stale_historical_archive_runs/);
  assert.match(migration, /run\.status in \('queued', 'running'\)/);
  assert.match(migration, /token\.consumed_at is null/);
  assert.match(migration, /token\.expires_at > now\(\)/);
  assert.match(migration, /stale_archive_run_expired/);
  assert.match(migration, /for update skip locked/);
});

test('archive queue serializes cron attempts and checks recent runs before scanning payload tables', () => {
  assert.match(queueFunction, /pg_try_advisory_xact_lock/);
  assert.match(queueFunction, /queue_lock_busy/);

  const activeRunCheck = queueFunction.indexOf('from public.data_archive_runs run');
  const firstPayloadScan = queueFunction.indexOf("if v_policy.table_name = 'bronze_historical_records'");
  assert.ok(activeRunCheck >= 0 && firstPayloadScan > activeRunCheck);
});

test('dataset-specific scans do not retain the generic OR predicate that caused sequential scans', () => {
  assert.doesNotMatch(
    queueFunction,
    /v_policy\.dataset_code = '\*'\s+or\s+dataset_code = v_policy\.dataset_code/i,
  );
  assert.match(queueFunction, /where dataset_code = v_policy\.dataset_code\s+and ingested_at <= v_cutoff/);
  assert.match(queueFunction, /where dataset_code = v_policy\.dataset_code\s+and observed_at <= v_cutoff/);
});

test('archive queue keeps failures bounded and private', () => {
  assert.match(queueFunction, /when lock_not_available or deadlock_detected/);
  assert.match(queueFunction, /or serialization_failure or query_canceled/);
  assert.match(queueFunction, /'status', 'deferred'/);
  assert.match(queueFunction, /revoke all on function private\.queue_due_historical_excel_archives\(\)/);
  assert.match(queueFunction, /grant execute on function private\.queue_due_historical_excel_archives\(\)\s+to service_role/);
});
