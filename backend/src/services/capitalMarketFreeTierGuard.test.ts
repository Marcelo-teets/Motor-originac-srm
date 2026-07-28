import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../../db/migrations/136_cvm_free_tier_storage_guard.sql', import.meta.url);
const workflowUrl = new URL('../../../.github/workflows/cvm-production-intelligence.yml', import.meta.url);

test('capital-market writer enforces compact hot storage and decision-useful links', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /\{bronze,payload\}/);
  assert.match(sql, /compact_manifest/);
  assert.match(sql, /\{event,raw_payload\}/);
  assert.match(sql, /official_source_and_cold_archive/);
  assert.match(sql, /is_primary_origination_target/);
  assert.match(sql, /'debtor', 'originator', 'assignor', 'securitizer'/);
  assert.match(sql, /compact_capital_market_entity_links/);
});

test('production intelligence workflow never performs implicit push or scheduled backfills', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.doesNotMatch(workflow, /^\s+schedule:/m);
  assert.match(workflow, /if: github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(workflow, /TRIGGER="backfill"/);
  assert.doesNotMatch(workflow, /cvm_fund_documents/);
  assert.match(workflow, /default: "25000"/);
});
