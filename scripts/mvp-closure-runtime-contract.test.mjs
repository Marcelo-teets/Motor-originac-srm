import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('signal ingestion only queues heavy company reprocessing', async () => {
  const sql = await read('db/migrations/144_origination_reprocessing_queue.sql');
  assert.match(sql, /origination_reprocessing_queue/);
  assert.match(sql, /enqueue_company_origination_reprocessing/);
  assert.match(sql, /process_origination_reprocessing_queue/);
  assert.doesNotMatch(sql, /perform public\.refresh_company_factor_snapshots\(new\.company_id/i);
  assert.doesNotMatch(sql, /perform public\.refresh_company_origination_brief_v1\(v_company_id\)/i);
});

test('derived reprocessing is bounded and scheduled independently from capture', async () => {
  const sql = await read('db/migrations/145_origination_reprocessing_schedule.sql');
  assert.match(sql, /origination-derived-reprocessing/);
  assert.match(sql, /process_origination_reprocessing_queue\(25\)/);
  assert.match(sql, /\*\/5 \* \* \* \*/);
});

test('automatic entity resolution deduplicates canonical keys and quarantines conflicts', async () => {
  const sql = await read('db/migrations/146_automatic_candidate_entity_resolution.sql');
  assert.match(sql, /website_identity_capture,status/);
  assert.match(sql, /automatic_deterministic_identity/);
  assert.match(sql, /canonical_key_conflict/);
  assert.match(sql, /domain_cnpj_conflict/);
  assert.match(sql, /status','quarantined'/);
  assert.match(sql, /company_discovery_links/);
  assert.match(sql, /enqueue_company_origination_reprocessing/);
});

test('verified operating issuers use strict CNPJ identity and remain deduplicated', async () => {
  const sql = await read('db/migrations/148_operating_issuer_resolution_and_analytics_fix.sql');
  assert.match(sql, /candidate_role='operating_issuer'/);
  assert.match(sql, /coalesce\(c\.cnpj_valid,false\)/);
  assert.match(sql, /automatic_deterministic_issuer_identity/);
  assert.match(sql, /canonical_key_conflict/);
  assert.match(sql, /domain_cnpj_conflict/);
  assert.match(sql, /status','quarantined'/);
  assert.match(sql, /excluded_from_qualification',false/);
  assert.match(sql, /excluded_from_scoring',false/);
});

test('verified real entities enter origination analytics without becoming credit-approved', async () => {
  const sql = await read('db/migrations/147_origination_entity_eligibility_gate.sql');
  assert.match(sql, /verified_entity_ready_for_origination_qualification/);
  assert.match(sql, /origination_analytics_eligible/);
  assert.match(sql, /credit_approval_separate/);
  assert.match(sql, /credit_review_status',''\)<>'rejected'/);
});

test('candidate promotion refreshes monitoring and recomputes downstream artifacts', async () => {
  const service = await read('backend/src/services/searchProfileCaptureService.ts');
  assert.match(service, /derivedDataRecomputed/);
  assert.match(service, /await this\.hooks\.recomputeDerivedData\(companyId\)/);
  assert.doesNotMatch(service, /recomputeDerivedDataSkipped:\s*true/);
  assert.doesNotMatch(service, /derivedDataRecomputeSkipped:\s*true/);
});
