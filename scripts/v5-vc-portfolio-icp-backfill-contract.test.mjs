import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../db/neon/20261013_neon_vc_portfolio_unverified_icp_backfill.sql',import.meta.url),'utf8');
test('portfolio-only correction is restricted to one reviewed historical cohort',()=>{
  assert.ok(sql.includes("v_count <> 14"));
  assert.ok(sql.includes("v_updated <> 14"));
  assert.ok(sql.includes("source_ref like 'vc-portfolio:%'"));
  assert.ok(sql.includes("candidate_role = 'operating_company'"));
  assert.ok(sql.includes("candidate_status = 'captured'"));
  assert.ok(sql.includes("company_id is null"));
});
test('preserve original ICP as unverified hypothesis and never create companies',()=>{
  assert.ok(sql.includes("historicalProfileHypothesis"));
  assert.ok(sql.includes("identityAndCreditReviewRequired"));
  assert.ok(sql.includes("segment = 'Unverified'"));
  assert.ok(sql.includes("target_structure = 'Unknown'"));
  for (const prohibited of ['delete from','truncate','insert into','drop table'])
    assert.equal(sql.toLowerCase().includes(prohibited),false,prohibited);
});
