import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const functionsRoot = new URL('../supabase/functions/', import.meta.url);
const requiredFunctionDirectories = [
  'agentetome-ingest-export',
  'agentetome-recover-package',
  'agentetome-validate-xml',
  'auth-rollout-orchestrator',
  'historical-archive-catalog-export',
  'historical-archive-catalog-export-proxy',
  'historical-archive-sheet-data',
  'historical-excel-catalog',
  'historical-excel-export',
  'knowledge-embedding-worker',
  'knowledge-hybrid-search',
];

const retiredAuth = await readFile(
  new URL('../supabase/functions/auth-rollout-orchestrator/index.ts', import.meta.url),
  'utf8',
);

const disabledArchiveSources = await Promise.all([
  'historical-archive-catalog-export',
  'historical-archive-catalog-export-proxy',
  'historical-archive-sheet-data',
].map((slug) => readFile(
  new URL(`../supabase/functions/${slug}/index.ts`, import.meta.url),
  'utf8',
)));

test('every deployed Supabase Edge Function has a versioned source directory', async () => {
  const entries = await readdir(functionsRoot, { withFileTypes: true });
  const directories = new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );

  for (const slug of requiredFunctionDirectories) {
    assert.ok(directories.has(slug), `Missing versioned Edge Function source: ${slug}`);
  }
});

test('retired one-time Auth orchestrator remains permanently unavailable', () => {
  assert.match(retiredAuth, /status:\s*"retired"/);
  assert.match(retiredAuth, /status:\s*410/);
  assert.match(retiredAuth, /cache-control":\s*"no-store"/);
  assert.doesNotMatch(retiredAuth, /fetch\s*\(/);
});

test('disabled archive endpoints are inert and cannot silently become data paths', () => {
  for (const source of disabledArchiveSources) {
    assert.match(source, /error:\s*"disabled"/);
    assert.match(source, /status:\s*410/);
    assert.match(source, /cache-control":\s*"no-store"/);
    assert.doesNotMatch(source, /fetch\s*\(/);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  }
});
