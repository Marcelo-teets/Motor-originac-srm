import assert from 'node:assert/strict';
import test from 'node:test';
import { APPROVED_V5_PENDING_MIGRATIONS, verifyApprovedNeonPendingMigrations } from './lib/neon-v5-release-migration-gate.mjs';

test('allows exactly the two reviewed V5 migrations', () => {
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
