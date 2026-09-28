import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../db/neon/20260928_neon_data_api_default_deny.sql', import.meta.url), 'utf8');

test('Neon Data API stays default-deny before explicit RLS policy rollout', () => {
  assert.match(sql, /revoke all on schema public from anonymous, authenticated/i);
  assert.match(sql, /revoke all privileges on all tables in schema public from anonymous, authenticated/i);
  assert.match(sql, /alter default privileges for role neondb_owner in schema public\s+revoke all on tables from authenticated/i);
  assert.match(sql, /revoke execute on functions from authenticated/i);
  assert.doesNotMatch(sql, /\bgrant\b[^\n]*\bauthenticated\b/i);
});
