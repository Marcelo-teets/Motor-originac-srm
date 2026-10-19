import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveryDue, assessPersistedRecovery, MIN_RECOVERY_GAP_HOURS, CAPTURE_RECOVERY_TIMEZONE } from './should-run-daily-recovery.mjs';
import { readFileSync } from 'node:fs';

const clock = '2026-10-19T19:00:00.000Z';
test('daily recovery is based on Sao Paulo calendar days, not 20 rolling hours', () => {
  assert.equal(MIN_RECOVERY_GAP_HOURS, 8);
  assert.equal(CAPTURE_RECOVERY_TIMEZONE, 'America/Sao_Paulo');
  assert.equal(recoveryDue(null, clock), true);
  assert.equal(recoveryDue('2026-10-19T20:18:00Z', '2026-10-20T13:25:00Z'), true);
  assert.equal(recoveryDue('2026-10-19T23:40:00Z', '2026-10-20T02:30:00Z'), false);
  assert.equal(recoveryDue('2026-10-20T02:30:00Z', '2026-10-20T04:30:00Z'), false);
  assert.equal(recoveryDue('2026-10-20T02:59:00Z', '2026-10-20T13:25:00Z'), true);
  assert.equal(recoveryDue('2026-10-20T11:00:00Z', '2026-10-20T22:10:00Z'), false);
});
test('rejects impossible/future timestamps rather than skipping data capture silently', () => {
  assert.throws(() => recoveryDue('invalid', clock), /Invalid latest capture timestamp/);
  assert.throws(() => recoveryDue('2026-10-20T00:00:00Z', clock), /in the future/);
  assert.throws(() => recoveryDue(null, 'invalid'), /nowIso must be/);
  assert.throws(() => recoveryDue(null, clock, -1), /minimumGapHours/);
});
test('capture recovery workflow only reuses bounded engine and canonical Neon connection', () => {
  const yml = readFileSync(new URL('../../.github/workflows/capture-daily-recovery.yml', import.meta.url), 'utf8');
  assert.match(yml, /schedule:\s*\n\s*- cron: '25 13 \* \* \*'/);
  assert.match(yml, /scripts\/load-neon-from-vercel\.sh/);
  assert.match(yml, /scripts\/check-neon-storage-budget\.mjs --requested-rows=8 --trigger=schedule/);
  assert.match(yml, /scripts\/capture\/bounded-capture-fanout\.sh/);
  assert.match(yml, /MAX_PARALLELISM: '1'/);
  assert.match(yml, /MAX_CAPTURE_TARGETS: '8'/);
  assert.match(yml, /steps\.due\.outputs\.run == 'true'/);
  assert.match(yml, /scripts\/capture\/should-run-daily-recovery\.mjs --verify/);
  assert.doesNotMatch(yml, /\bMOTOR_AUTH_BOOTSTRAP_ENABLED\b|\bCREATE TABLE\b/);
});

test('daily recovery workflow cannot contain YAML-invalid plain run scalars with colon-space', () => {
  const yml = readFileSync(new URL('../../.github/workflows/capture-daily-recovery.yml', import.meta.url), 'utf8');
  assert.match(yml, /- name: Report paused storage gate[\s\S]*?run: \|\s*\n\s+echo 'Daily recovery paused by Neon storage guard: NOT an accepted healthy monitoring day\.'/);
  // YAML plain scalars may not contain an unescaped colon followed by whitespace.
  // Keep shell commands containing ":" in a block scalar, not run: echo '...: ...'.
  assert.doesNotMatch(yml, /^\s+run:\s*(?![|>])[^\n]*:\s+[^\n]*$/m);
});

test('capture health only recognizes completed and persisted outputs', () => {
  const source = readFileSync(new URL('./should-run-daily-recovery.mjs', import.meta.url), 'utf8');
  assert.match(source, /where status = 'completed' and outputs_written > 0/);
  assert.match(source, /recoveryDue\(latestEffectiveCapture, now\.toISOString\(\)\)/);
  assert.doesNotMatch(source, /recoveryDue\(latestCronCapture, now\.toISOString\(\)\)/);
  const result = assessPersistedRecovery({ attempts: 6, completed: 4, effective: 2, outputsWritten: 8, release: 'verified' });
  assert.deepEqual(result, { passed: true, attempts: 6, completed: 4, effective: 2, outputsWritten: 8, release: 'verified' });
  for (const counters of [
    { attempts: 1, completed: 0, effective: 0, outputsWritten: 0 },
    { attempts: 1, completed: 1, effective: 0, outputsWritten: 0 },
    { attempts: 0, completed: 0, effective: 0, outputsWritten: 0 },
  ]) {
    assert.throws(() => assessPersistedRecovery({ ...counters, release: 'test' }), /no completed|did not persist/);
  }
  assert.throws(() => assessPersistedRecovery({ attempts: 1, completed: 0, effective: -1, outputsWritten: 2, release: 'invalid' }), /invalid counters/);
});

test('the recovery verifier cannot pass on another invocation or on old attempts', () => {
  const source = readFileSync(new URL('./should-run-daily-recovery.mjs', import.meta.url), 'utf8');
  const yml = readFileSync(new URL('../../.github/workflows/capture-daily-recovery.yml', import.meta.url), 'utf8');
  assert.match(source, /CAPTURE_RECOVERY_STARTED_AT/);
  assert.match(source, /started_at >= \$2::timestamptz/);
  assert.match(source, /metadata->>'release' = \$1/);
  assert.doesNotMatch(source, /started_at >= now\(\) - interval '45 minutes'/);
  assert.match(yml, /Mark start of this recovery invocation/);
  assert.match(yml, /CAPTURE_RECOVERY_STARTED_AT=\$\(date -u/);
  assert.match(yml, /Confirm this invocation persisted completed capture with outputs/);
  assert.match(yml, /steps\.storage\.outputs\.blocked != 'true'/);
  assert.match(yml, /MAX_CAPTURE_TARGETS: '8'/);
  assert.match(yml, /MAX_PARALLELISM: '1'/);
});

test('calendar-based health does not loosen current-invocation or Neon storage gates', () => {
  const service = readFileSync(new URL('./should-run-daily-recovery.mjs', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../../.github/workflows/capture-daily-recovery.yml', import.meta.url), 'utf8');
  assert.match(service, /America\/Sao_Paulo/);
  assert.match(service, /MIN_RECOVERY_GAP_HOURS = 8/);
  assert.match(service, /saoPauloDay\(latestIso\) === saoPauloDay\(nowIso\)/);
  assert.match(service, /reason: run \? 'no_effective_capture_today_with_safe_gap'/);
  assert.doesNotMatch(service, /CAPTURE_COOLDOWN_HOURS = 20/);
  assert.match(workflow, /cron: '25 13 \* \* \*'/);
  assert.match(workflow, /CAPTURE_RECOVERY_STARTED_AT/);
  assert.match(workflow, /MAX_CAPTURE_TARGETS: '8'/);
  assert.match(workflow, /MAX_PARALLELISM: '1'/);
});
