import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
export const MIN_RECOVERY_GAP_HOURS = 8;
export const CAPTURE_RECOVERY_TIMEZONE = 'America/Sao_Paulo';

const saoPauloDay = (iso) => {
  const date = new Date(iso);
  assert.ok(!Number.isNaN(date.getTime()), 'Invalid calendar timestamp');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAPTURE_RECOVERY_TIMEZONE, year: 'numeric',
    month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/**
 * A seven-calendar-day SLA is not a rolling 20-hour SLA. A successful run
 * yesterday afternoon must not block today's 10:25 BRT recovery. But we
 * require a minimum 8-hour safety gap and at most one effective run per
 * São Paulo calendar day. Storage budget and bounded batch also gate writes.
 */
export const recoveryDue = (latestIso, nowIso, minimumGapHours = MIN_RECOVERY_GAP_HOURS) => {
  const now = Date.parse(nowIso);
  assert.ok(Number.isFinite(now), 'nowIso must be a valid timestamp');
  assert.ok(Number.isFinite(minimumGapHours) && minimumGapHours > 0);
  if (latestIso == null) return true;
  const latest = Date.parse(latestIso);
  if (!Number.isFinite(latest)) throw new Error('Invalid latest capture timestamp');
  if (latest > now) throw new Error('Capture timestamp is in the future');
  if (saoPauloDay(latestIso) === saoPauloDay(nowIso)) return false;
  return now - latest >= minimumGapHours * 60 * 60 * 1000;
};

export const checkDailyRecovery = async ({
  connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL,
  now = new Date(),
} = {}) => {
  if (!connectionString) throw new Error('Missing canonical Neon production database credentials');
  const url = new URL(connectionString);
  if (!url.hostname.endsWith('.neon.tech')) throw new Error('Daily recovery must use canonical Neon database');
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8_000, statement_timeout: 8_000 });
  try {
    const { rows } = await pool.query(`
      select max(started_at) as latest_cron_capture,
             max(started_at) filter (
               where status = 'completed' and outputs_written > 0
             ) as latest_effective_capture
      from public.source_connector_runs
      where scope_type = 'company'
        and trigger_type = 'cron'
    `);
    const asIso = (value) => value instanceof Date ? value.toISOString() : value == null ? null : String(value);
    const latestCronCapture = asIso(rows[0]?.latest_cron_capture);
    const latestEffectiveCapture = asIso(rows[0]?.latest_effective_capture);
    // Failures, partial executions and zero-output completions must NOT
    // suppress today's recovery. A recent healthy capture does suppress it.
    const nowIso = now.toISOString();
    const run = recoveryDue(latestEffectiveCapture, nowIso);
    const capturedToday = latestEffectiveCapture != null
      && saoPauloDay(latestEffectiveCapture) === saoPauloDay(nowIso);
    return {
      run, latestCronCapture, latestEffectiveCapture, now: nowIso,
      localDate: saoPauloDay(nowIso), timeZone: CAPTURE_RECOVERY_TIMEZONE,
      minimumGapHours: MIN_RECOVERY_GAP_HOURS,
      reason: run ? 'no_effective_capture_today_with_safe_gap'
        : capturedToday ? 'effective_capture_already_today'
          : 'minimum_gap_not_elapsed',
    };
  } finally {
    await pool.end();
  }
};


// Only successful, persisted data from THIS invocation may satisfy the gate.
// An older invocation with the same release label must never pass a new run.
export const assessPersistedRecovery = ({ attempts, completed, effective, outputsWritten, release }) => {
  const counts = [attempts, completed, effective, outputsWritten].map(Number);
  if (!counts.every(v => Number.isSafeInteger(v) && v >= 0)) {
    throw new Error('Capture audit returned invalid counters');
  }
  const [attemptCount, completedCount, effectiveCount, outputCount] = counts;
  if (attemptCount === 0) throw new Error('Recovery runner did not persist company-source attempts for this invocation');
  if (effectiveCount === 0 || outputCount === 0) {
    throw new Error('Recovery runner persisted no completed company-source capture with real outputs in this invocation');
  }
  return { passed: true, attempts: attemptCount, completed: completedCount, effective: effectiveCount, outputsWritten: outputCount, release };
};

export const verifyPersistedRecovery = async ({
  connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL,
  release = process.env.CAPTURE_RELEASE || 'motor-v5-daily-recovery',
  startedAt = process.env.CAPTURE_RECOVERY_STARTED_AT,
} = {}) => {
  if (!connectionString) throw new Error('Missing Neon credentials for recovery audit verification');
  if (!new URL(connectionString).hostname.endsWith('.neon.tech')) throw new Error('Recovery audit verification must use Neon');
  if (!startedAt || !Number.isFinite(Date.parse(startedAt))) {
    throw new Error('CAPTURE_RECOVERY_STARTED_AT is required to verify only this invocation');
  }
  const startMs = Date.parse(startedAt);
  if (startMs > Date.now() + 30_000 || Date.now() - startMs > 60 * 60 * 1000) {
    throw new Error('Recovery invocation timestamp is out of the allowed one-hour window');
  }
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8_000, statement_timeout: 8_000 });
  try {
    const { rows } = await pool.query(`
      select count(*)::integer as attempts,
             count(*) filter (where status='completed')::integer as completed,
             count(*) filter (where status='completed' and outputs_written > 0)::integer as effective,
             coalesce(sum(outputs_written) filter (
               where status='completed' and outputs_written > 0
             ),0)::integer as outputs_written
      from public.source_connector_runs
      where scope_type='company' and trigger_type='cron'
        and started_at >= $2::timestamptz
        and metadata->>'release' = $1
    `, [release, startedAt]);
    return assessPersistedRecovery({ ...rows[0], outputsWritten: rows[0]?.outputs_written, release });
  } finally { await pool.end(); }
};

const isDirect = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
if (isDirect) {
  const command = process.argv.includes('--verify') ? verifyPersistedRecovery() : checkDailyRecovery();
  command.then((result) => {
    const output = JSON.stringify(result);
    console.log(output);
    if (process.env.GITHUB_OUTPUT && 'run' in result) appendFileSync(process.env.GITHUB_OUTPUT, `run=${result.run}\nreason=${result.reason}\n`);
    if (process.env.GITHUB_STEP_SUMMARY && 'run' in result) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Daily bounded capture recovery\n\n- Run required: ${result.run}\n- Last cron company attempt: ${result.latestCronCapture ?? 'none'}\n- Last effective capture with real outputs: ${result.latestEffectiveCapture ?? 'none'}\n- Sao Paulo calendar date: ${result.localDate}\n- Minimum safety gap: ${result.minimumGapHours}h\n- Reason: ${result.reason}\n\n`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
