import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(new URL('../db/migrations/152_regulated_issuer_identity_calibration.sql', import.meta.url), 'utf8');

test('keeps generic name/domain threshold at 0.92', () => {
  assert.match(sql, />=0\.92/);
});

test('allows 0.90 only for CVM-backed operating issuers', () => {
  assert.match(sql, /candidate_role='operating_issuer'/);
  assert.match(sql, /c\.cvm_code is not null/);
  assert.match(sql, /cvm_registration_situation/);
  assert.match(sql, />=0\.90/);
});

test('patches only the existing resolver definition instead of duplicating architecture', () => {
  assert.match(sql, /pg_get_functiondef\('public\.auto_resolve_verified_candidate_entities_v4/);
  assert.match(sql, /execute v_definition/);
});
