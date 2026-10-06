import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const api = read('api/agentetome.ts');
const neonAuth = read('serverless/neon-auth.ts');
const panel = read('frontend/src/components/AgentetomeOperationsPanel.tsx');
const pipeline = read('backend/src/services/agentetomePipeline.ts');
const controlPlane = read('db/neon/20261006_neon_agentetome_runtime.sql');

test('Agentetome secret is server-side and the runtime is Neon-authenticated', () => {
  assert.match(api, /process\.env\.AGENTETOME_API_KEY/);
  assert.match(api, /verifyActiveIdentity/);
  assert.match(api, /verifyGodModeIdentity/);
  assert.doesNotMatch(api, /SUPABASE_|\.supabase\.co|supabase\/functions/i);
  assert.match(neonAuth, /NEON_AUTH_/);
});

test('admin operations require GOD-MODE and run the Vercel pipeline against Neon', () => {
  assert.match(api, /requireGodMode\(user\.authorization\)/);
  assert.match(api, /runAdminExport\(/);
  assert.match(api, /record_agentetome_admin_manifest/);
  assert.match(api, /requireNeonDataClient/);
  assert.match(api, /operation === 'due-exports'[\s\S]*authenticateCron\(req\)/);
});

test('the pipeline keeps the provider contract and never persists the signed link or the raw ZIP', () => {
  assert.match(pipeline, /\/api\/v1\/export\/admin\/manifest/);
  assert.match(pipeline, /name: 'exportar_admin'/);
  assert.match(pipeline, /url\.hostname !== 'www\.agentetome\.com'/);
  assert.match(pipeline, /finalize_agentetome_direct_package_v2/);
  assert.match(pipeline, /refresh_agentetome_existing_package/);
  assert.match(pipeline, /raw_download_link_persisted: false/);
  assert.doesNotMatch(pipeline, /link_download:\s*payload/);
});

test('the Neon control plane has no vault, pg_net, http or pg_cron dependency', () => {
  assert.doesNotMatch(controlPlane, /vault\.|net\.http|extensions\.http|cron\.(schedule|job)/);
  assert.match(controlPlane, /function public\.claim_due_agentetome_targets/);
  assert.match(controlPlane, /'secretMode', 'vercel_env'/);
});

test('XML validation follows the official Agentetome privacy and upload contract', () => {
  assert.match(api, /api\/v1\/validar-xml/);
  assert.match(api, /form\.append\('arquivo'/);
  assert.match(api, /5 \* 1024 \* 1024/);
  assert.match(api, /record_agentetome_validation_audit/);
  assert.match(api, /rawXmlPersisted: false/);
  assert.match(api, /sentToCvm: false/);
});

test('operations UI exposes refresh and XML validation without a legacy deployment path', () => {
  assert.match(panel, /Atualizar Agentetome agora/);
  assert.match(panel, /Validar XML/);
});
