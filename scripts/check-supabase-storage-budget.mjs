import { appendFileSync } from 'node:fs';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

const requestedRows = Math.max(0, Number.parseInt(args.get('requested-rows') || '0', 10) || 0);
const triggerType = String(args.get('trigger') || 'manual').trim() || 'manual';
const { query, closeNeonPool } = await import('./lib/neon-db.mjs');
let payload;
try {
  const rows = await query(
    'select public.assert_ingestion_storage_budget($1, $2, $3) as result',
    ['github_actions_preflight', requestedRows, triggerType],
  );
  payload = rows[0]?.result ?? {};
} catch (error) {
  console.error(`Storage budget preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
} finally {
  await closeNeonPool();
}

const state = String(payload?.state || 'unknown');
const allowedRows = Math.max(0, Number.parseInt(String(payload?.allowed_rows ?? '0'), 10) || 0);
const databaseMb = Number(payload?.database_mb ?? 0);
const backfillBlocked = triggerType === 'backfill' && state !== 'healthy';
const effectiveRows = backfillBlocked ? 0 : Math.min(requestedRows, allowedRows);
const blocked = requestedRows > 0 && effectiveRows <= 0;
const capped = effectiveRows > 0 && effectiveRows < requestedRows;

const result = {
  state,
  databaseMb,
  allowedRows,
  requestedRows,
  effectiveRows,
  triggerType,
  blocked,
  capped,
};

console.log(JSON.stringify(result));

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `state=${state}`,
    `database_mb=${databaseMb}`,
    `allowed_rows=${allowedRows}`,
    `requested_rows=${requestedRows}`,
    `effective_rows=${effectiveRows}`,
    `trigger=${triggerType}`,
    `blocked=${blocked}`,
    `capped=${capped}`,
    '',
  ].join('\n'));
}
