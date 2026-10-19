import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
export const CAPTURE_COOLDOWN_HOURS = 20;

/**
 * Scheduling guard only: DO NOT infer this proves source health or successful
 * capture. The existing bounded runner records real results separately.
 */
export const recoveryDue = (latestIso, nowIso, cooldownHours = CAPTURE_COOLDOWN_HOURS) => {
  const now = Date.parse(nowIso);
  assert.ok(Number.isFinite(now), 'nowIso must be a valid timestamp');
  assert.ok(Number.isFinite(cooldownHours) && cooldownHours > 0);
  if (latestIso == null) return true;
  const latest = Date.parse(latestIso);
  if (!Number.isFinite(latest)) throw new Error('Invalid latest capture timestamp');
  if (latest > now) throw new Error('Capture timestamp is in the future');
  return now - latest >= cooldownHours * 60 * 60 * 1000;
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
      select max(started_at) as latest_cron_capture
      from public.source_connector_runs
      where scope_type = 'company'
        and trigger_type = 'cron'
        and status in ('completed','partial','failed')
    `);
    const latest = rows[0]?.latest_cron_capture;
    const latestIso = latest instanceof Date ? latest.toISOString() : latest == null ? null : String(latest);
    const run = recoveryDue(latestIso, now.toISOString());
    return { run, latestCronCapture: latestIso, now: now.toISOString(), cooldownHours: CAPTURE_COOLDOWN_HOURS, reason: run ? 'no_company_capture_during_cooldown' : 'recent_company_capture_exists' };
  } finally {
    await pool.end();
  }
};


export const verifyPersistedRecovery = async ({
  connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL,
  release = process.env.CAPTURE_RELEASE || 'motor-v5-daily-recovery',
} = {}) => {
  if (!connectionString) throw new Error('Missing Neon credentials for recovery audit verification');
  if (!new URL(connectionString).hostname.endsWith('.neon.tech')) throw new Error('Recovery audit verification must use Neon');
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8_000, statement_timeout: 8_000 });
  try {
    const { rows } = await pool.query(`
      select count(*)::integer as attempts,
             count(*) filter (where status='completed')::integer as completed
      from public.source_connector_runs
      where scope_type='company' and trigger_type='cron'
        and started_at >= now() - interval '45 minutes'
        and metadata->>'release' = $1
    `, [release]);
    const attempts = Number(rows[0]?.attempts ?? 0);
    if (attempts === 0) throw new Error('Recovery runner returned without persisting any real company-source attempts');
    return { passed: true, attempts, completed: Number(rows[0]?.completed ?? 0), release };
  } finally { await pool.end(); }
};

const isDirect = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
if (isDirect) {
  const command = process.argv.includes('--verify') ? verifyPersistedRecovery() : checkDailyRecovery();
  command.then((result) => {
    const output = JSON.stringify(result);
    console.log(output);
    if (process.env.GITHUB_OUTPUT && 'run' in result) appendFileSync(process.env.GITHUB_OUTPUT, `run=${result.run}\nreason=${result.reason}\n`);
    if (process.env.GITHUB_STEP_SUMMARY && 'run' in result) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Daily bounded capture recovery\n\n- Run required: ${result.run}\n- Last cron company capture: ${result.latestCronCapture ?? 'none'}\n- Cooldown: ${result.cooldownHours}h\n- Reason: ${result.reason}\n\n`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
