import { readFileSync } from 'node:fs';
import pg from 'pg';

const connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || '';
if (!connectionString) throw new Error('MOTOR_NEON_DATABASE_URL or DATABASE_URL is required.');

const migrations = [
  'db/neon/20261005_neon_runtime_roles.sql',
  'db/migrations/035_capital_market_public_data.sql',
  'db/migrations/044_capital_market_ingestion_health.sql',
  'db/migrations/060_origination_knowledge_vault.sql',
  'db/migrations/076_knowledge_company_workspace.sql',
  'db/migrations/077_knowledge_vault_function_grants_hardening.sql',
  'db/migrations/078_knowledge_capture_concurrency_lock.sql',
  'db/migrations/082_knowledge_saved_views_bases.sql',
  'db/migrations/083_knowledge_monitoring_output_capture.sql',
  'db/migrations/085_knowledge_execution_actions.sql',
  'db/migrations/086_knowledge_execution_reference_validation.sql',
  'db/migrations/087_knowledge_execution_completion_guard.sql',
  'db/migrations/088_knowledge_execution_result_lineage.sql',
  'db/migrations/089_knowledge_execution_context.sql',
  'db/migrations/090_knowledge_execution_outcome_views.sql',
  'db/migrations/092_knowledge_outcome_intelligence_rpc.sql',
  'db/migrations/093_knowledge_outcome_operations.sql',
  'db/migrations/094_knowledge_outcome_workbench.sql',
  'db/migrations/108_dcm_daily_outreach_operating_loop.sql',
  'db/neon/20261005_neon_microsoft_runtime.sql',
  'db/neon/20261005_neon_archive_metadata.sql',
  'db/migrations/20260727173000_source_control_sheet_sync.sql',
  'db/migrations/132_fidcs_source_and_catalog_governance.sql',
  'db/migrations/133_cvm_fund_documents_and_source_schedules.sql',
];

const cleanSql = (sql) => sql
  .replace(/^\s*begin;\s*$/gim, '')
  .replace(/^\s*commit;\s*$/gim, '');

const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10000,
  statement_timeout: 120000,
  application_name: 'motor-neon-runtime-migrator',
});
const client = await pool.connect();

try {
  await client.query('create schema if not exists private');
  await client.query(
    "create table if not exists private.motor_neon_migrations (" +
    "migration_key text primary key," +
    "applied_at timestamptz not null default now()," +
    "git_sha text," +
    "metadata jsonb not null default '{}'::jsonb" +
    ")"
  );

  for (const file of migrations) {
    const done = await client.query(
      'select 1 from private.motor_neon_migrations where migration_key=$1',
      [file],
    );
    if (done.rowCount) {
      console.log('skip', file);
      continue;
    }

    const sql = cleanSql(readFileSync(file, 'utf8'));
    console.log('apply', file);
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='10s'");
      await client.query("set local statement_timeout='120s'");
      await client.query(sql);
      await client.query(
        'insert into private.motor_neon_migrations(migration_key,git_sha,metadata) values($1,$2,$3::jsonb)',
        [file, process.env.GITHUB_SHA || null, JSON.stringify({ wave: 'runtime-core-20261005' })],
      );
      await client.query('commit');
      console.log('ok', file);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      console.error('failed', file, error instanceof Error ? error.message : error);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  client.release();
  await pool.end();
}
