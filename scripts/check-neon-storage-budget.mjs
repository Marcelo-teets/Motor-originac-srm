// Neon storage-budget preflight for GitHub Actions ingestion jobs.
// Replaces scripts/check-supabase-storage-budget.mjs (removed with the legacy
// provider) and keeps its CLI and GITHUB_OUTPUT contract:
//   node scripts/check-neon-storage-budget.mjs --requested-rows=500 --trigger=manual
// Outputs: state, database_mb, allowed_rows, requested_rows, effective_rows,
// trigger, blocked, capped. The source of truth is the Neon growth circuit
// breaker (db/neon/20261001_neon_database_growth_circuit_breaker.sql).
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Row allowance per guard status. "degraded" keeps small incremental runs alive;
// "block_raw" stops every raw/heavy write (the database trigger would reject them).
export const ROW_ALLOWANCE = Object.freeze({ normal: 50_000, degraded: 2_000, block_raw: 0, unknown: 0 });
const STATE_BY_STATUS = Object.freeze({ normal: 'healthy', degraded: 'degraded', block_raw: 'blocked', unknown: 'unknown' });

// Observed on 09/10/2026: ~124k capital-market records grew the database by
// ~433 MB (≈3.5 KB per record across events, bronze, metrics and entity links).
// Rounded up so the projection errs on the safe side.
export const ESTIMATED_BYTES_PER_INGESTED_ROW = 4_000;

// Rows that still fit before the next guard threshold: the soft limit while the
// guard is normal, the hard limit while degraded. Null when the guard does not
// report limits (keeps the legacy behaviour for partial payloads).
export const headroomRows = (guard, status) => {
  const current = Number(guard?.current_bytes);
  const limit = Number(status === 'normal' ? guard?.soft_limit_bytes : guard?.hard_limit_bytes);
  if (!Number.isFinite(current) || !Number.isFinite(limit) || limit <= 0) return null;
  return Math.max(0, Math.floor((limit - current) / ESTIMATED_BYTES_PER_INGESTED_ROW));
};

export const parseArgs = (argv) => {
  const args = new Map(argv.map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  }));
  return {
    requestedRows: Math.max(0, Number.parseInt(args.get('requested-rows') || '0', 10) || 0),
    triggerType: String(args.get('trigger') || 'manual').trim() || 'manual',
  };
};

export const evaluateBudget = ({ guard, requestedRows, triggerType }) => {
  const status = String(guard?.status ?? 'unknown');
  const state = STATE_BY_STATUS[status] ?? 'unknown';
  const headroom = headroomRows(guard, status);
  const allowedRows = Math.min(ROW_ALLOWANCE[status] ?? 0, headroom ?? Number.POSITIVE_INFINITY);
  const databaseMb = Math.round((Number(guard?.current_bytes ?? 0) / 1_000_000) * 100) / 100;
  const backfillBlocked = triggerType === 'backfill' && state !== 'healthy';
  const effectiveRows = backfillBlocked ? 0 : Math.min(requestedRows, allowedRows);
  const blocked = requestedRows > 0 && effectiveRows <= 0;
  const capped = effectiveRows > 0 && effectiveRows < requestedRows;
  return { state, guardStatus: status, databaseMb, allowedRows, headroomRows: headroom, requestedRows, effectiveRows, triggerType, blocked, capped };
};

export const githubOutputLines = (result) => [
  `state=${result.state}`,
  `database_mb=${result.databaseMb}`,
  `allowed_rows=${result.allowedRows}`,
  `requested_rows=${result.requestedRows}`,
  `effective_rows=${result.effectiveRows}`,
  `trigger=${result.triggerType}`,
  `blocked=${result.blocked}`,
  `capped=${result.capped}`,
  '',
].join('\n');

const main = async () => {
  const { requestedRows, triggerType } = parseArgs(process.argv.slice(2));
  const { query, closeNeonPool } = await import('./lib/neon-db.mjs');
  let guard;
  try {
    const rows = await query('select private.refresh_database_growth_guard() as guard');
    guard = rows[0]?.guard ?? {};
  } finally {
    await closeNeonPool();
  }
  const result = evaluateBudget({ guard, requestedRows, triggerType });
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, githubOutputLines(result));
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`Neon storage budget preflight failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
