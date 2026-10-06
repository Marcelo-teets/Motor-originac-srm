import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const api = read('api/agentetome.ts');
const neonAuth = read('serverless/neon-auth.ts');
const panel = read('frontend/src/components/AgentetomeOperationsPanel.tsx');

test('Agentetome secret is server-side and the runtime is Neon-authenticated', () => {
  assert.match(api, /process\.env\.AGENTETOME_API_KEY/);
  assert.match(api, /verifyActiveIdentity/);
  assert.match(api, /verifyGodModeIdentity/);
  assert.doesNotMatch(api, /SUPABASE_|\.supabase\.co|supabase\/functions/i);
  assert.match(neonAuth, /NEON_AUTH_/);
});

test('admin operations require GOD-MODE and execute through the canonical Neon RPC layer', () => {
  assert.match(api, /requireGodMode\(user\.authorization\)/);
  assert.match(api, /queue_agentetome_admin_export/);
  assert.match(api, /agentetome_admin_manifest_secure/);
  assert.match(api, /requireNeonDataClient/);
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
