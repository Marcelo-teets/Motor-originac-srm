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
  const allowedRows = ROW_ALLOWANCE[status] ?? 0;
  const databaseMb = Math.round((Number(guard?.current_bytes ?? 0) / 1_000_000) * 100) / 100;
  const backfillBlocked = triggerType === 'backfill' && state !== 'healthy';
  const effectiveRows = backfillBlocked ? 0 : Math.min(requestedRows, allowedRows);
  const blocked = requestedRows > 0 && effectiveRows <= 0;
  const capped = effectiveRows > 0 && effectiveRows < requestedRows;
  return { state, guardStatus: status, databaseMb, allowedRows, requestedRows, effectiveRows, triggerType, blocked, capped };
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
