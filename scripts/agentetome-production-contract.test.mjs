import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const api = read('api/agentetome.ts');
const ingest = read('supabase/functions/agentetome-ingest-export/index.ts');
const xml = read('supabase/functions/agentetome-validate-xml/index.ts');
const control = read('db/migrations/128_agentetome_production_control_plane.sql');
const lineage = read('db/migrations/129_agentetome_current_snapshot_lineage.sql');
const runtime = read('db/migrations/130_agentetome_runtime_current_vs_history.sql');
const panel = read('frontend/src/components/AgentetomeOperationsPanel.tsx');
const rolloutWorkflow = read('.github/workflows/agentetome-production-rollout.yml');
const rolloutMarker = JSON.parse(read('ops/rollouts/agentetome-production-2026-07-26.json'));

test('Agentetome secret stays in Supabase Vault and browser roles are denied', () => {
  assert.match(control, /vault\.decrypted_secrets/);
  assert.match(control, /revoke all on function public\.get_agentetome_runtime_secret\(\) from public,anon,authenticated/i);
  assert.doesNotMatch(api, /AGENTETOME_API_KEY/);
});

test('admin exports are GOD-MODE and use the Supabase control plane', () => {
  assert.match(api, /requireGodMode\(user\.id\)/);
  assert.match(api, /queue_agentetome_admin_export/);
  assert.match(control, /agentetome-due-export-refresh/);
  assert.match(control, /private\.run_agentetome_due_exports/);
});

test('ingestion validates archive, reconciles deduplicated lineage and atomically syncs silver', () => {
  const reconcileAt = ingest.indexOf('stage = "refresh_bronze_lineage"');
  const refreshAt = ingest.indexOf('stage = "refresh_existing_package"');
  assert.ok(reconcileAt >= 0 && refreshAt > reconcileAt);
  assert.match(ingest, /finalize_agentetome_direct_package_v2/);
  assert.match(ingest, /record_agentetome_target_failure/);
  assert.match(lineage, /package_hashes/);
  assert.match(lineage, /latest parsed package per active export target/i);
});

test('XML validation follows the official Agentetome privacy and upload contract', () => {
  assert.match(xml, /api\/v1\/validar-xml/);
  assert.match(xml, /form\.append\("arquivo"/);
  assert.match(xml, /5 \* 1024 \* 1024/);
  assert.match(xml, /record_agentetome_validation_audit/);
  assert.match(xml, /rawXmlPersisted: false/);
  assert.match(xml, /sentToCvm: false/);
});

test('runtime reports current snapshot separately from retained history and never auto-scores', () => {
  assert.match(runtime, /historicalFidcEvents/);
  assert.match(runtime, /from public\.agentetome_fidc_market_map_v1/);
  assert.match(runtime, /'scoreImpact',false/);
  assert.match(panel, /Atualizar Agentetome agora/);
  assert.match(panel, /Validar XML/);
});

test('production rollout separates code blockers from external blockers without breaking legacy markers', () => {
  assert.match(
    rolloutWorkflow,
    /const codeBlockers = marker\.acceptance\?\.codeBlockers \?\? marker\.acceptance\?\.blockers/,
  );
  assert.match(rolloutWorkflow, /if \(codeBlockers !== 0\) process\.exit\(1\)/);
  assert.match(rolloutWorkflow, /externalBlockers \?\? 0/);
  assert.equal(rolloutMarker.acceptance.codeBlockers, 0);
  assert.equal(rolloutMarker.acceptance.externalBlockers, 1);
  assert.equal(typeof rolloutMarker.acceptance.externalBlocker, 'string');
});
