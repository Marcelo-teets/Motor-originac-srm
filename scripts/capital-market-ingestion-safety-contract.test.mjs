import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const yaml = readFileSync(new URL('../.github/workflows/capital-market-ingestion.yml', import.meta.url), 'utf8');

test('CVM workflow rejects broad manual and issue/PR bootstraps', () => {
  assert.doesNotMatch(yaml, /^\s+- all\s*$/m);
  assert.doesNotMatch(yaml, /^  issues:$/m);
  assert.doesNotMatch(yaml, /^  pull_request:$/m);
  assert.doesNotMatch(yaml, /--dataset all\b/);
});

test('CVM code pushes cannot ingest without explicit trigger file', () => {
  assert.match(yaml, /git show --format= --name-only HEAD/);
  assert.match(yaml, /grep -Fxq 'backend\/src\/services\/\.cvm-trigger'/);
  assert.match(yaml, /steps\.push_scope\.outputs\.enabled == 'true'/);
});

test('CVM scheduled and manual runs have run-wide modest limits', () => {
  assert.match(yaml, /default: "1000"/);
  assert.match(yaml, /MAX_ROWS="1000"/);
  assert.match(yaml, /MAX_ROWS="500"/);
  assert.ok(yaml.includes('cron: "40 10 * * 1"'));
  assert.ok(yaml.includes('cron: "40 11 * * 1"'));
  assert.match(yaml, /DATASET="cvm_company_fre"/);
  assert.match(yaml, /DATASET="cvm_fidc_monthly"/);
  assert.doesNotMatch(yaml, /MAX_ROWS="20000"/);
  assert.match(yaml, /scripts\/check-neon-storage-budget\.mjs/);
});
