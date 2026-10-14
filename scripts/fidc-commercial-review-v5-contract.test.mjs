import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../db/neon/20261014_neon_fidc_commercial_review_v5.sql', import.meta.url), 'utf8');

test('triage is zero-copy, read-only and security-invoker', () => {
  for (const token of [
    'create or replace view public.fidc_assignor_commercial_review_v5',
    'security_invoker = true',
    'security_barrier = true',
    'from public.fidc_assignor_identity_queue_v5',
    'revoke all on public.fidc_assignor_commercial_review_v5',
    'grant select on public.fidc_assignor_commercial_review_v5 to neondb_owner'
  ]) assert.ok(sql.includes(token), token);
  for (const forbidden of [
    'insert into', 'update public.companies', 'delete from',
    'drop table', 'create table', 'materialized view'
  ]) assert.ok(!sql.toLowerCase().includes(forbidden), forbidden);
});

test('triage does not assert ICP or credit fit from legal name', () => {
  for (const token of [
    'registry_lookup_pending', 'registration_exception_review',
    'regulated_entity_review', 'business_model_due_diligence',
    "'unverified'::text as icp_eligibility_status",
    "'unknown'::text as receivables_structurability_status",
    "'unknown'::text as funding_gap_status",
    'false as auto_promotion_authorized'
  ]) assert.ok(sql.includes(token), token);
});

test('triage retains CVM trace and dedupe of CNPJ establishments', () => {
  for (const token of [
    'cnpj_root', 'establishments_in_cvm_queue',
    'q.registry_provider', 'q.registry_url', 'q.registry_checked_at',
    'q.evidence_url as cvm_evidence_url', 'q.evidence_file as cvm_evidence_file',
    'q.latest_reference_date as cvm_reference_date',
    'q.distinct_funds', 'q.evidence_links'
  ]) assert.ok(sql.includes(token), token);
});
