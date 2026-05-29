const DEFAULT_URL = 'https://motor-originac-srm-marcelo-teets-projects.vercel.app/api/data-capture/health';
const url = process.env.SMOKE_URL || DEFAULT_URL;
const attempts = Number(process.env.SMOKE_ATTEMPTS || 12);
const delayMs = Number(process.env.SMOKE_DELAY_MS || 10000);

const requiredTables = [
  'companies',
  'source_catalog',
  'source_connector_runs',
  'monitoring_outputs',
  'company_signals',
  'qualification_snapshots',
  'lead_score_snapshots',
  'pipeline',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Health payload is not JSON object.');
  if (payload.status !== 'real') throw new Error(`Expected status=real, got ${payload.status}.`);
  if (!payload.captureRuntime?.canRunAgainstSupabase) throw new Error('Runtime is not connected to the database.');
  if (!payload.captureRuntime?.coreTablesAccessible) throw new Error('Core tables are not accessible.');

  const tableMap = new Map((payload.tables || []).map((item) => [item.table, item]));
  for (const table of requiredTables) {
    const check = tableMap.get(table);
    if (!check) throw new Error(`Missing table check: ${table}.`);
    if (!check.ok) throw new Error(`Table check failed for ${table}: ${check.error || 'unknown error'}.`);
    if (typeof check.count !== 'number') throw new Error(`Table ${table} did not return a numeric count.`);
  }
}

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
    const payload = JSON.parse(text);
    assertPayload(payload);
    console.log(JSON.stringify({
      ok: true,
      url,
      attempt,
      status: payload.status,
      generatedAt: payload.generatedAt,
      tables: Object.fromEntries((payload.tables || []).map((item) => [item.table, item.count])),
    }, null, 2));
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`Smoke attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : String(error)}`);
    if (attempt < attempts) await sleep(delayMs);
  }
}

console.error(`Vercel health smoke failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
process.exit(1);
