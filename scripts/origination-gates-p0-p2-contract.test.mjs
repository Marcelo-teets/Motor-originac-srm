import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [icpSql, triggerSql, headcountSql] = await Promise.all([
  read('db/migrations/153_origination_icp_gate_and_security_closure.sql'),
  read('db/migrations/154_material_trigger_engine_and_recalculation.sql'),
  read('db/migrations/155_verified_headcount_icp_gate.sql'),
]);

test('keeps entity analytics separate from commercial decision eligibility', () => {
  assert.match(icpSql, /origination_analytics_eligible/);
  assert.match(icpSql, /decision_eligible/);
  assert.match(icpSql, /identity_verified_pending_icp/);
  assert.match(icpSql, /is_company_origination_icp_eligible/);
});

test('requires company-level headcount evidence and excludes QA profiles', () => {
  assert.match(headcountSql, /company_verified_headcount_floor/);
  assert.match(headcountSql, /company_source_metric_snapshots/);
  assert.match(headcountSql, /observed_vs_inferred='observed'/);
  assert.match(headcountSql, /observed_at>=now\(\)-interval '365 days'/);
  assert.match(headcountSql, /not coalesce\(sp\.config \? 'qaSmoke',false\)/);
  assert.match(headcountSql, />=greatest\(50,sp\.min_employee_count\)/);
  assert.match(headcountSql, /icp_headcount_override/);
});

test('material trigger engine persists lineage, dedupes and applies staleness', () => {
  assert.match(triggerSql, /create table if not exists public\.trigger_catalog/);
  assert.match(triggerSql, /dedupe_key/);
  assert.match(triggerSql, /One economic trigger family per company\/day/);
  assert.match(triggerSql, /stale_after/);
  assert.match(triggerSql, /interval '30 days'/);
  assert.match(triggerSql, /interval '90 days'/);
  assert.match(triggerSql, /interval '180 days'/);
  assert.match(triggerSql, /recalculate_decision_layers_from_trigger/);
  assert.match(triggerSql, /monitoringOutputId/);
  assert.match(triggerSql, /sourceId/);
  assert.match(triggerSql, /evidenceUrl/);
});

test('browser roles cannot forge material trigger events', () => {
  assert.match(triggerSql, /revoke insert,update,delete on public\.trigger_events from authenticated/);
  assert.match(triggerSql, /grant select,insert,update,delete on public\.trigger_events to service_role/);
});

test('ranking uses the decision gate and trigger freshness rather than raw duplicated signals', () => {
  assert.match(triggerSql, /public\.is_company_decision_eligible/);
  assert.match(triggerSql, /trigger_freshness/);
  assert.match(triggerSql, /duplicate evidence suppressed/);
});
