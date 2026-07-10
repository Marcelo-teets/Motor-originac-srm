// Smoke de persistência de captura (issue #128).
//
// Valida o critério de aceite: uma execução real de captura deve gravar e
// conseguir ler source_connector_runs, source_documents, monitoring_outputs,
// company_signals e enrichments usando os IDs canônicos do runtime.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   SMOKE_API_URL=https://motor-originac-srm-marcelo-teets-projects.vercel.app/api \
//   CRON_SECRET=... node scripts/smoke/capture-persistence-smoke.mjs
//
// Sem SMOKE_API_URL/CRON_SECRET o script não dispara uma captura nova e apenas
// audita as linhas mais recentes já persistidas.

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const apiUrl = (process.env.SMOKE_API_URL || '').replace(/\/$/, '');
const cronSecret = process.env.CRON_SECRET || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY) são obrigatórios.');
  process.exit(1);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idShape = (value) => {
  if (value === null || value === undefined) return 'null';
  const text = String(value);
  if (uuidPattern.test(text)) return 'uuid';
  if (/^(cmp|src)_/i.test(text)) return 'runtime_text';
  return 'other_text';
};

async function selectRows(table, query) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table}: HTTP ${response.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function triggerCaptureRun() {
  if (!apiUrl || !cronSecret) {
    console.log('SMOKE_API_URL/CRON_SECRET ausentes — pulando disparo de captura, auditando dados existentes.');
    return null;
  }
  const response = await fetch(`${apiUrl}/data-capture/run`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${cronSecret}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Disparo de captura falhou: HTTP ${response.status} ${text.slice(0, 240)}`);
  const payload = JSON.parse(text);
  console.log(`Captura disparada: status=${payload.status} outputs=${payload.data?.persisted?.outputsWritten} signals=${payload.data?.persisted?.signalsWritten}`);
  return payload;
}

const tables = [
  { table: 'source_connector_runs', order: 'started_at.desc', idColumns: ['company_id', 'source_id'] },
  { table: 'source_documents', order: 'created_at.desc', idColumns: ['company_id', 'source_id'] },
  { table: 'monitoring_outputs', order: 'created_at.desc', idColumns: ['company_id', 'source_id'] },
  { table: 'company_signals', order: 'created_at.desc', idColumns: ['company_id'] },
  { table: 'enrichments', order: 'created_at.desc', idColumns: ['company_id'] },
];

const runStartedAt = new Date().toISOString();
const failures = [];
const report = {};

try {
  await triggerCaptureRun();
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

for (const { table, order, idColumns } of tables) {
  try {
    const rows = await selectRows(table, { select: '*', order, limit: '5' });
    const shapes = {};
    for (const column of idColumns) {
      shapes[column] = [...new Set(rows.map((row) => idShape(row[column])))];
    }
    report[table] = { readable: true, rows: rows.length, idShapes: shapes };
    if (!rows.length) {
      failures.push(`${table}: legível porém vazio — captura não persistiu ou gravação está sendo rejeitada silenciosamente.`);
    }
  } catch (error) {
    report[table] = { readable: false, error: error instanceof Error ? error.message : String(error) };
    failures.push(`${table}: leitura falhou.`);
  }
}

// Diagnóstico do drift uuid × text (issue #128): amostra o shape dos IDs base.
try {
  const companies = await selectRows('companies', { select: 'id', limit: '5' });
  const catalog = await selectRows('source_catalog', { select: 'id', limit: '5' });
  report.identityContract = {
    companiesIdShapes: [...new Set(companies.map((row) => idShape(row.id)))],
    sourceCatalogIdShapes: [...new Set(catalog.map((row) => idShape(row.id)))],
  };
} catch (error) {
  report.identityContract = { error: error instanceof Error ? error.message : String(error) };
}

console.log(JSON.stringify({ ok: failures.length === 0, runStartedAt, report, failures }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
