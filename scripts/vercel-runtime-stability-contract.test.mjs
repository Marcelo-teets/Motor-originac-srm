import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [packageSource, ciSource, apiSource, vercelSource] = await Promise.all([
  read('package.json'),
  read('.github/workflows/ci.yml'),
  read('api/index.ts'),
  read('vercel.json'),
]);
const packageJson = JSON.parse(packageSource);
const vercelJson = JSON.parse(vercelSource);

test('Vercel production is pinned to the stable Node 22 runtime while CI remains on Node 24', () => {
  assert.equal(packageJson.engines?.node, '22.x');
  assert.match(ciSource, /node-version:\s*24/);
});

test('capture diagnostics bound every Supabase table probe below the function timeout', () => {
  assert.match(apiSource, /CAPTURE_HEALTH_QUERY_TIMEOUT_MS\s*=\s*4_000/);
  assert.match(apiSource, /signal:\s*AbortSignal\.timeout\(CAPTURE_HEALTH_QUERY_TIMEOUT_MS\)/);
  assert.ok(Number(vercelJson.functions?.['api/index.ts']?.maxDuration ?? 0) >= 15);
});

test('runtime does not silence deprecations or retain the ineffective Express URL bridge', () => {
  assert.doesNotMatch(apiSource, /process\.emitWarning\s*=/);
  assert.doesNotMatch(apiSource, /installExpressUrlBridge/);
  assert.doesNotMatch(packageSource, /test:vercel-url-runtime/);
  assert.doesNotMatch(ciSource, /WHATWG URL runtime bridge/);
});
