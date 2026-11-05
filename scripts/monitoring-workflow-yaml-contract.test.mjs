import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('source schedule auditor is a valid scheduled job with nested steps', () => {
  const yaml = read('.github/workflows/source-schedule-audit.yml');
  assert.match(yaml, /^on:\s*\n\s{2}schedule:/m);
  assert.match(yaml, /^  audit:\s*$/m);
  assert.match(yaml, /^    steps:\s*$/m);
  assert.match(yaml, /^      - uses: actions\/checkout@v4/m);
  assert.match(yaml, /^      - if: github\.event_name != 'pull_request'/m);
  assert.doesNotMatch(yaml, /^steps:\s*$/m, 'steps must be nested below jobs.audit');
  assert.match(yaml, /scripts\/sources\/audit-source-schedules\.mjs/);
});

test('CVM documents ingestion has all runner environment keys scoped within ingest env', () => {
  const yaml = read('.github/workflows/cvm-fund-documents-schedule.yml');
  assert.match(yaml, /^  ingest:\s*$/m);
  assert.match(yaml, /^    env:\s*\n      MOTOR_NEON_DATABASE_URL: .*\n      SCHEDULE_EXPRESSION:/m);
  for (const key of ['REQUESTED_DATASET','REQUESTED_REFERENCE','REQUESTED_MAX_ROWS']) {
    assert.match(yaml, new RegExp(`^      ${key}:`, 'm'));
  }
  assert.doesNotMatch(yaml, /^SCHEDULE_EXPRESSION:/m, 'scope must be within jobs.ingest.env');
  assert.match(yaml, /^    steps:\s*$/m);
  assert.match(yaml, /node scripts\/check-neon-storage-budget\.mjs/);
});

test('critical capture and Neon scheduled jobs keep real bounded cron contracts', () => {
  const capture = read('.github/workflows/capture.yml');
  const jobs = read('.github/workflows/neon-scheduled-jobs.yml');
  assert.match(capture, /cron: "0 2,8,14,20 \* \* \*"/);
  assert.match(capture, /scripts\/capture\/bounded-capture-fanout\.sh/);
  assert.match(jobs, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(jobs, /scripts\/run-neon-scheduled-jobs\.mjs/);
  assert.doesNotMatch(capture + jobs, /MOTOR_AUTH_BOOTSTRAP_ENABLED=true/);
});

// P0: a healthy storage guard is not a compute-budget preflight; neither
// scheduler may open Neon before metadata-only, fail-closed quota validation.
test('Neon scheduled and daily recovery workflows gate database access on compute budget', () => {
  const workflows = [
    read('.github/workflows/neon-scheduled-jobs.yml'),
    read('.github/workflows/capture-daily-recovery.yml'),
  ];
  for (const yaml of workflows) {
    const preflight = yaml.indexOf('      - name: Preflight Neon compute budget (metadata only, fail closed)');
    const loadConnection = yaml.indexOf('      - name: Load canonical Neon connection from Vercel vault');
    assert.ok(preflight > 0 && loadConnection > preflight, 'quota preflight must precede DB credential loading');
    assert.ok(yaml.includes('NEON_API_KEY: ${{ secrets.NEON_API_KEY }}'), 'provider API credential is scoped to the guard');
    assert.ok(yaml.includes('run: node scripts/neon-free-budget-guard.mjs'), 'must reuse shared fail-closed guard');
  }
  const jobs = workflows[0];
  assert.ok(jobs.indexOf('      - name: Resolve jobs for this trigger') < jobs.indexOf('      - name: Preflight Neon compute budget'), 'resolve requested jobs before conditional preflight');
  assert.ok(jobs.includes("contains(steps.jobs.outputs.jobs, 'reprocessing')"));
  assert.ok(jobs.includes("contains(steps.jobs.outputs.jobs, 'derived-materialization')"));
  const recovery = workflows[1];
  assert.ok(recovery.indexOf('      - name: Preflight Neon compute budget') < recovery.indexOf('      - name: Validate storage budget for bounded recovery'));
});

// The acceptance evidence schedule performs live SELECTs and can wake production compute.
test('scheduled V5 acceptance evidence fails closed before opening Neon', () => {
  const yaml = read('.github/workflows/v5-daily-acceptance-evidence.yml');
  const preflight = yaml.indexOf('      - name: Preflight Neon compute budget (metadata only, fail closed)');
  const load = yaml.indexOf('      - name: Read canonical Vercel production Neon connection');
  const evaluate = yaml.indexOf('      - name: Evaluate seven fully elapsed days of genuine monitoring');
  const diligence = yaml.indexOf('      - name: Export live A2 primary-source human diligence queue');
  assert.ok(preflight > 0 && load > preflight && evaluate > load && diligence > evaluate,
    'metadata-only compute guard must run before any production Neon evidence queries');
  assert.ok(yaml.includes('NEON_API_KEY: ${{ secrets.NEON_API_KEY }}'));
  assert.ok(yaml.includes('run: node scripts/neon-free-budget-guard.mjs'));
  assert.match(yaml, /node scripts\/v5-mvp-acceptance-evidence\.mjs/);
  assert.match(yaml, /node scripts\/a2-diligence-report\.mjs/);
});
