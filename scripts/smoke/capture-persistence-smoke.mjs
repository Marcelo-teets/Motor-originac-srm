// Smoke de persistência Neon da captura.
// Audita as tabelas canônicas e, opcionalmente, dispara uma captura via API.
import pg from 'pg';

const connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || '';
const apiUrl = (process.env.SMOKE_API_URL || '').replace(/\/$/, '');
const cronSecret = process.env.CRON_SECRET || '';

if (!connectionString) {
  console.error('MOTOR_NEON_DATABASE_URL (ou DATABASE_URL) é obrigatório.');
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

async function triggerCaptureRun() {
  if (!apiUrl || !cronSecret) {
    console.log('SMOKE_API_URL/CRON_SECRET ausentes — auditando apenas dados persistidos.');
    return null;
  }
  const response = await fetch(`${apiUrl}/data-capture/run`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${cronSecret}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Disparo de captura falhou: HTTP ${response.status} ${text.slice(0,240)}`);
  return JSON.parse(text);
}

const tables = [
  { table: 'source_connector_runs', order: 'started_at', idColumns: ['company_id','source_id'] },
  { table: 'source_documents', order: 'created_at', idColumns: ['company_id','source_id'] },
  { table: 'monitoring_outputs', order: 'created_at', idColumns: ['company_id','source_id'] },
  { table: 'company_signals', order: 'created_at', idColumns: ['company_id'] },
  { table: 'enrichments', order: 'created_at', idColumns: ['company_id'] },
];

const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
const failures = [];
const report = {};
try {
  try { await triggerCaptureRun(); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }

  for (const { table, order, idColumns } of tables) {
    try {
      const result = await pool.query(`select * from public."${table}" order by "${order}" desc nulls last limit 5`);
      const shapes = {};
      for (const column of idColumns) shapes[column] = [...new Set(result.rows.map((row) => idShape(row[column])))];
      report[table] = { readable: true, rows: result.rows.length, idShapes: shapes };
      if (!result.rows.length) failures.push(`${table}: legível porém vazio.`);
    } catch (error) {
      report[table] = { readable: false, error: error instanceof Error ? error.message : String(error) };
      failures.push(`${table}: leitura falhou.`);
    }
  }

  const companies = await pool.query('select id from public.companies limit 5');
  const catalog = await pool.query('select id from public.source_catalog limit 5');
  report.identityContract = {
    companiesIdShapes: [...new Set(companies.rows.map((row) => idShape(row.id)))],
    sourceCatalogIdShapes: [...new Set(catalog.rows.map((row) => idShape(row.id)))],
  };
} finally {
  await pool.end();
}

console.log(JSON.stringify({ ok: failures.length === 0, report, failures }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
