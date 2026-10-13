import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../db/neon/20261013_neon_fidc_assignor_identity_queue_v5.sql', import.meta.url), 'utf8');

test('queue is only a protected view, never a new raw storage copy', () => {
  assert.ok(sql.includes('create or replace view public.fidc_assignor_identity_queue_v5'));
  assert.ok(sql.includes('security_invoker = true'));
  assert.ok(sql.includes('security_barrier = true'));
  assert.ok(sql.includes('revoke all on public.fidc_assignor_identity_queue_v5'));
  assert.doesNotMatch(sql, /\b(?:insert into|delete from|truncate|drop table|create table|refresh materialized)\b/i);
});

test('assignor queue requires CVM Tab I, provenance and checksum valid CNPJ', () => {
  for (const t of [
    "l.dataset_code = 'cvm_fidc_monthly'",
    "l.entity_role = 'assignor'",
    "l.is_primary_origination_target = true",
    'public.is_valid_cnpj_checksum(l.entity_cnpj)',
    'e.source_file_name',
    'e.source_url',
    'count(distinct fund_cnpj)',
    'group by cnpj',
  ]) assert.ok(sql.includes(t), t);
});

test('queue does not grant automated promotion or anonymous visibility', () => {
  assert.ok(sql.includes("else 'needs_registry_identity'"));
  assert.ok(sql.includes('anonymous, authenticated'));
  assert.doesNotMatch(sql, /\b(?:approve_candidate_identity_review|auto_resolve_verified_candidate_entities_v4)\s*\(/i);
});
