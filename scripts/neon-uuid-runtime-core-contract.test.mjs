import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const core = readFileSync(new URL('../db/neon/20260928_neon_uuid_runtime_core.sql', import.meta.url), 'utf8');
const ext = readFileSync(new URL('../db/neon/20260928_neon_uuid_extended_runtime.sql', import.meta.url), 'utf8');
const intel = readFileSync(new URL('../db/neon/20260928_neon_origination_intelligence_modules.sql', import.meta.url), 'utf8');

test('Neon runtime core preserves live UUID identity contract', () => {
  assert.match(core, /create table if not exists public\.companies[\s\S]*?id uuid primary key/i);
  assert.match(core, /create table if not exists public\.source_catalog[\s\S]*?id uuid primary key/i);
  assert.match(core, /source_catalog_metadata_code_uidx/i);
  assert.match(core, /monitoring_outputs[\s\S]*?company_id uuid/i);
  assert.match(core, /company_signals[\s\S]*?company_id uuid/i);
  assert.match(core, /qualification_snapshots[\s\S]*?company_id uuid/i);
  assert.match(core, /company_patterns[\s\S]*?pattern_id uuid/i);
  assert.match(core, /pipeline[\s\S]*?company_id uuid/i);
});

test('Neon runtime core uses the production search profile shape', () => {
  assert.match(core, /target_segments text\[\]/i);
  assert.match(core, /target_keywords text\[\]/i);
  assert.match(core, /active boolean/i);
  assert.match(core, /config jsonb/i);
});

test('Neon extended runtime covers commercial and intelligence writers with UUID FKs', () => {
  for (const table of [
    'watchlists','watchlist_items','account_stakeholders','touchpoints','objection_instances',
    'engine_requests','engine_learning_events','candidate_official_enrichments',
    'public_dataset_runs','public_company_records','investors',
    'company_investor_relationships','company_job_openings','company_credit_reviews'
  ]) assert.match(ext, new RegExp('create table if not exists public\\.'+table, 'i'));
  assert.match(ext, /watchlist_items[\s\S]*?company_id uuid/i);
  assert.match(ext, /account_stakeholders[\s\S]*?company_id uuid/i);
  assert.match(ext, /public_company_records[\s\S]*?company_id uuid/i);
  assert.match(ext, /company_credit_reviews[\s\S]*?company_id uuid/i);
});

test('Neon runtime migrations do not copy Supabase managed schemas or permissive grants', () => {
  const all=core+'\n'+ext;
  assert.doesNotMatch(all, /references\s+auth\.users/i);
  assert.doesNotMatch(all, /\bstorage\./i);
  assert.doesNotMatch(all, /\bcron\./i);
  assert.doesNotMatch(all, /grant\s+.+\s+to\s+authenticated/i);
  assert.match(all, /revoke all privileges on all tables in schema public from anonymous, authenticated/i);
});


test('Neon origination intelligence modules cover factor map and timing evidence', () => {
  for (const table of [
    'trigger_events','company_source_metric_snapshots','company_linkedin_role_snapshots',
    'origination_factor_catalog','source_factor_rules','company_factor_observations',
    'company_factor_snapshots','source_schedule_registry'
  ]) assert.match(intel, new RegExp('create table if not exists public\\.'+table, 'i'));
  assert.match(intel,/company_source_metric_snapshots[\s\S]*?company_id uuid/i);
  assert.match(intel,/company_factor_observations[\s\S]*?signal_id uuid/i);
  assert.match(intel,/credit_product_intensity/);
  assert.match(intel,/receivables_quality/);
  assert.match(intel,/dcm_market_access/);
  assert.match(intel,/compliance_blocker/);
  assert.doesNotMatch(intel,/grant\s+.+\s+to\s+authenticated/i);
});
