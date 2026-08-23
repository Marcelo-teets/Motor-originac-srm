import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const runner = await read('scripts/capture/run-bounded-capture-batch.ts');
const shell = await read('scripts/capture/bounded-capture-fanout.sh');
const workflow = await read('.github/workflows/capture.yml');

test('scheduled capture executes the canonical runtime directly on GitHub Actions', () => {
  assert.match(runner, /createPlatformRepository\('supabase'\)/);
  assert.match(runner, /new CaptureRuntimeService\(repository\)/);
  assert.match(runner, /buildBoundedCaptureTargets/);
  assert.match(runner, /runtime\.run\(/);
  assert.match(runner, /github-actions-direct/);
});

test('direct runner is safe to import during CI without starting production capture', () => {
  assert.match(runner, /pathToFileURL/);
  assert.match(runner, /isDirectExecution/);
  assert.match(runner, /export const runDirectCaptureBatch/);
});

test('capture selection is fair across companies and sources are serialized within each company', () => {
  assert.match(runner, /export const selectCaptureTargetsRoundRobin/);
  assert.match(runner, /export const groupCaptureTargetsByCompany/);
  assert.match(runner, /for \(const target of group\) \{\s*await runTarget\(target, workerId\);/s);
  assert.match(runner, /parallel_between_companies_serial_within_company/);
  assert.doesNotMatch(runner, /let cursor = 0/);
});

test('fanout shell no longer calls Vercel HTTP endpoints', () => {
  assert.match(shell, /SUPABASE_URL/);
  assert.match(shell, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(shell, /run-bounded-capture-batch\.ts/);
  assert.doesNotMatch(shell, /curl/);
  assert.doesNotMatch(shell, /CAPTURE_URL/);
  assert.doesNotMatch(shell, /TARGETS_URL/);
});

test('workflow provides Supabase persistence directly and retains bounded smoke on push', () => {
  assert.match(workflow, /SUPABASE_URL: \$\{\{ secrets\.SUPABASE_URL \}\}/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.match(workflow, /CAPTURE_RELEASE: "github-actions-direct-v2-company-serialized"/);
  assert.match(workflow, /MAX_TARGETS="50"/);
  assert.match(workflow, /timeout-minutes: 120/);
  assert.doesNotMatch(workflow, /CAPTURE_URL:/);
  assert.doesNotMatch(workflow, /TARGETS_URL:/);
});
