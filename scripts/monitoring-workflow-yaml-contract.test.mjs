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
