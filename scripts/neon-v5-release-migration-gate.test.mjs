import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { APPROVED_V5_PENDING_MIGRATIONS, verifyApprovedNeonPendingMigrations } from './lib/neon-v5-release-migration-gate.mjs';

test('allows only the reviewed V5 migrations', () => {
  const planned = ['db/neon/applied.sql', ...APPROVED_V5_PENDING_MIGRATIONS];
  assert.deepEqual(
    verifyApprovedNeonPendingMigrations({ planned, applied: ['db/neon/applied.sql'] }),
    APPROVED_V5_PENDING_MIGRATIONS,
  );
});

test('remains idempotent after an approved release', () => {
  assert.deepEqual(verifyApprovedNeonPendingMigrations({
    planned: [...APPROVED_V5_PENDING_MIGRATIONS],
    applied: [...APPROVED_V5_PENDING_MIGRATIONS],
  }), []);
});

test('fails closed when a new migration has not been reviewed', () => {
  assert.throws(() => verifyApprovedNeonPendingMigrations({
    planned: [...APPROVED_V5_PENDING_MIGRATIONS, 'db/neon/new_unreviewed_migration.sql'],
    applied: [],
  }), /unapproved Neon migrations pending/);
});

test('rejects invalid ledger data', () => {
  assert.throws(() => verifyApprovedNeonPendingMigrations({
    planned: undefined,
    applied: [],
  }), /must be arrays/);
});

test('bronze index cleanup keeps canonical index and checks strict definition equality', () => {
  const sql = readFileSync(new URL('../db/neon/20261011_neon_bronze_duplicate_ref_index_cleanup.sql', import.meta.url), 'utf8');
  assert.match(sql, /bronze_historical_records_dataset_ref_idx/);
  assert.match(sql, /idx_bronze_historical_dataset_ref/);
  assert.match(sql, /is distinct from/);
  assert.match(sql, /raise exception 'bronze_duplicate_index_definition_mismatch'/);
  assert.match(sql, /drop index public\\.idx_bronze_historical_dataset_ref/);
  assert.doesNotMatch(sql, /drop (?:table|schema)/i);
});
