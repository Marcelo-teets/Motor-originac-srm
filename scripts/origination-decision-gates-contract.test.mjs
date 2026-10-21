import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(new URL('../db/neon/20261007_neon_origination_decision_gates.sql', import.meta.url), 'utf8');

test('decision eligibility is distinct from entity verification and requires 50+ headcount evidence', () => {
  assert.match(sql, /is_company_origination_icp_eligible/);
  assert.match(sql, /company_verified_headcount_floor/);
  assert.match(sql, /observed_vs_inferred='observed'/);
  assert.match(sql, /observed_at>=now\(\)-interval '365 days'/);
  assert.match(sql, />=greatest\(50,sp\.min_employee_count\)/);
  assert.match(sql, /not coalesce\(\(sp\.config->>'qaSmoke'\)::boolean,false\)/);
  assert.match(sql, /identity_verified_pending_icp/);
  assert.match(sql, /select public\.is_company_origination_icp_eligible\(p_company_id\)/);
});

test('material triggers are lineage-backed, deduped and asynchronous', () => {
  assert.match(sql, /create table if not exists public\.trigger_catalog/);
  assert.match(sql, /dedupe_key/);
  assert.match(sql, /stale_after/);
  assert.match(sql, /monitoringOutputId/);
  assert.match(sql, /evidenceUrl/);
  assert.match(sql, /enqueue_company_origination_reprocessing/);
  assert.doesNotMatch(sql, /refresh_ranking_v2\(\)/);
  assert.doesNotMatch(sql, /insert into public\.qualification_snapshots/);
});

test('firmographic enrichment is governed and cannot become identity authority', () => {
  assert.match(sql, /src_external_b2b_firmographics/);
  assert.match(sql, /headcount_evidence_only/);
  assert.match(sql, /'identityAuthority',false/);
  assert.match(sql, /'scheduled',false/);
});

test('capture decision and direct derived persistence both require approved human credit-review gate', async () => {
  const eligibility = await readFile(new URL('../backend/src/lib/companyDecisionEligibility.ts', import.meta.url),'utf8');
  const runtime = await readFile(new URL('../backend/src/services/captureRuntimeService.ts', import.meta.url),'utf8');
  const derived = await readFile(new URL('../backend/src/services/captureDerivedSyncService.ts', import.meta.url),'utf8');
  assert.match(eligibility, /review\?\.reviewId && review\.status === 'approved' && review\.outcome === 'eligible'/);
  assert.match(eligibility, /if \(!isCompanyDecisionEligible\(company\)\) return false/);
  assert.match(runtime, /isCompanyApprovedForCreditDerivation\(company\) && companiesWithEligibleEvidence\.has\(company\.id\)/);
  assert.match(derived, /if \(!isCompanyApprovedForCreditDerivation\(company\)\) return null/);
  assert.match(derived, /if \(!result \|\| result\.outputs\.length === 0\) return null/);
});
