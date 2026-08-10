import { appendFileSync } from 'node:fs';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

const requestedRows = Math.max(0, Number.parseInt(args.get('requested-rows') || '0', 10) || 0);
const triggerType = String(args.get('trigger') || 'manual').trim() || 'manual';
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const response = await fetch(`${supabaseUrl}/rest/v1/rpc/assert_ingestion_storage_budget`, {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    p_operation: 'github_actions_preflight',
    p_requested_rows: 0,
    p_trigger_type: 'manual',
  }),
  signal: AbortSignal.timeout(30_000),
});

const raw = await response.text();
let payload;
try {
  payload = raw ? JSON.parse(raw) : {};
} catch {
  payload = { raw };
}

if (!response.ok) {
  console.error(`Storage budget preflight failed (${response.status}): ${raw.slice(0, 1200)}`);
  process.exit(1);
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
