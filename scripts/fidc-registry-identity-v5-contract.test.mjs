import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../db/neon/20261013_neon_fidc_assignor_registry_identity_v5.sql', import.meta.url), 'utf8');

test('registry identities use a minimal CNPJ-keyed table with no raw data duplication', () => {
  assert.ok(sql.includes('fidc_assignor_registry_identities'));
  assert.ok(sql.includes('cnpj text primary key'));
  assert.ok(sql.includes('public.is_valid_cnpj_checksum(cnpj)'));
  assert.ok(sql.includes('registry_provider'));
  assert.ok(sql.includes('registry_checked_at'));
  assert.doesNotMatch(sql, /\b(?:delete from|truncate|drop table|create materialized view|insert into public.companies)\b/i);
});

test('read-only review queue requires source CVM provenance and human identity review', () => {
  assert.ok(sql.includes('with (security_invoker = true, security_barrier = true)'));
  assert.ok(sql.includes("l.entity_role = 'assignor'"));
  assert.ok(sql.includes('public.is_valid_cnpj_checksum(l.entity_cnpj)'));
  assert.ok(sql.includes('registry_identity_review_required'));
  assert.ok(sql.includes('revoke all on public.fidc_assignor_registry_identities'));
  assert.ok(sql.includes('revoke all on public.fidc_assignor_identity_queue_v5'));
  assert.doesNotMatch(sql, /\b(?:approve_candidate_identity_review|auto_resolve_verified_candidate_entities_v4)\s*\(/i);
});
