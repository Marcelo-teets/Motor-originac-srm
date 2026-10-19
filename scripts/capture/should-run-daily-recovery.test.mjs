import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveryDue, CAPTURE_COOLDOWN_HOURS } from './should-run-daily-recovery.mjs';
import { readFileSync } from 'node:fs';

const clock = '2026-10-19T19:00:00.000Z';
test('daily fallback is due only if no company-source cron attempt exists for 20h', () => {
  assert.equal(CAPTURE_COOLDOWN_HOURS, 20);
  assert.equal(recoveryDue(null, clock), true);
  assert.equal(recoveryDue('2026-10-18T22:59:59.000Z', clock), true);
  assert.equal(recoveryDue('2026-10-18T23:00:00.000Z', clock), true);
  assert.equal(recoveryDue('2026-10-18T23:00:01.000Z', clock), false);
  assert.equal(recoveryDue('2026-10-19T18:30:00.000Z', clock), false);
});
test('rejects impossible/future timestamps rather than skipping data capture silently', () => {
  assert.throws(() => recoveryDue('invalid', clock), /Invalid latest capture timestamp/);
  assert.throws(() => recoveryDue('2026-10-20T00:00:00Z', clock), /in the future/);
  assert.throws(() => recoveryDue(null, 'invalid'), /nowIso must be/);
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
