import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

// RECONCILIATION ONLY: reads aggregates/schema, never business rows or credentials.
// This is not a runtime adapter, migration or authorization to switch databases.
export const TABLES = Object.freeze([
  'companies', 'discovered_company_candidates', 'search_profiles',
  'source_catalog', 'source_connector_runs', 'monitoring_outputs',
  'company_signals', 'qualification_snapshots', 'company_patterns',
  'score_snapshots', 'lead_score_snapshots', 'pipeline',
  'company_credit_reviews', 'user_profiles',
]);

export const assertAuditConnections = (supabaseUrl, neonUrl) => {
  assert.ok(supabaseUrl && neonUrl, 'Both explicit database audit URLs are required');
  const sb = new URL(supabaseUrl), ne = new URL(neonUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(sb.protocol), 'Supabase URL must be PostgreSQL');
  assert.ok(['postgres:', 'postgresql:'].includes(ne.protocol), 'Neon URL must be PostgreSQL');
  assert.equal(sb.hostname, 'db.hdghpmssudrqhsbvrdyt.supabase.co', 'Refusing noncanonical Supabase project');
  assert.ok(ne.hostname.endsWith('.neon.tech') && ne.hostname.length > '.neon.tech'.length,
    'Refusing non-Neon comparison database');
  assert.notEqual(sb.hostname, ne.hostname, 'Cannot compare database to itself');
  return { supabaseHost: sb.hostname, neonHost: ne.hostname };
};

const ident = (value) => {
  assert.match(value, /^[a-z_][a-z0-9_]*$/i, 'Invalid database identifier');
  return '"' + value + '"';
};

const inspectReadOnly = async (url) => {
  const client = new pg.Client({
    connectionString: url, connectionTimeoutMillis: 10000, statement_timeout: 20000,
    application_name: 'motor-readonly-data-plane-inventory',
  });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const result = await client.query(
      'select table_name, column_name, data_type from information_schema.columns '
      + 'where table_schema = $1 and table_name = any($2::text[]) '
      + 'order by table_name, ordinal_position', ['public', TABLES]);
    const tables = {};
    for (const row of result.rows) {
      tables[row.table_name] ??= { columns: {}, count: null, lastUpdated: null };
      tables[row.table_name].columns[row.column_name] = row.data_type;
    }
    for (const name of TABLES) {
      const item = tables[name];
      if (!item) continue;
      const field = ['updated_at', 'created_at', 'started_at', 'captured_at']
        .find(column => column in item.columns);
      const sql = 'select count(*)::bigint as n '
        + (field ? ', max(' + ident(field) + ') as latest_change ' : '')
        + 'from public.' + ident(name);
      const rows = (await client.query(sql)).rows;
      item.count = Number(rows[0]?.n ?? 0);
      item.lastUpdated = field && rows[0]?.latest_change
        ? new Date(rows[0].latest_change).toISOString() : null;
    }
    await client.query('COMMIT');
    return tables;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
};

export const compareReadOnlyInventories = (supabase, neon) => {
  const tables = TABLES.map((table) => {
    const sb = supabase[table], ne = neon[table];
    if (!sb || !ne) return {
      table, supabasePresent: Boolean(sb), neonPresent: Boolean(ne),
      rowCounts: { supabase: sb?.count ?? null, neon: ne?.count ?? null },
      schemaMismatch: true,
    };
    const supabaseOnly = Object.keys(sb.columns).filter(key => !(key in ne.columns));
    const neonOnly = Object.keys(ne.columns).filter(key => !(key in sb.columns));
    const changedType = Object.keys(sb.columns)
      .filter(key => key in ne.columns && sb.columns[key] !== ne.columns[key])
      .map(key => ({ column: key, supabase: sb.columns[key], neon: ne.columns[key] }));
    return {
      table, supabasePresent: true, neonPresent: true,
      rowCounts: { supabase: sb.count, neon: ne.count },
      latestUpdated: { supabase: sb.lastUpdated, neon: ne.lastUpdated },
      supabaseOnly, neonOnly, changedType,
      schemaMismatch: Boolean(supabaseOnly.length || neonOnly.length || changedType.length),
    };
  });
  return {
    schema: 'motor.cutover.readonly-parity.1',
    status: 'blocked_pending_reviewed_mapping_and_human_signoff',
    readOnly: true,
    cutoverApproved: false,
    tables,
    mismatchedTables: tables.filter(table => table.schemaMismatch).length,
    warnings: [
      'Aggregate row counts do not establish credit quality, recency or approved human reviews.',
      'Preserve source IDs, lineages, historical snapshots, company ownership and Auth identities.',
      'A versioned, reversible migration and separate human institutional approval are mandatory.',
    ],
  };
};

export const collectReadOnlyCutoverInventory = async (supabaseUrl, neonUrl) => {
  assertAuditConnections(supabaseUrl, neonUrl);
  const [supabase, neon] = await Promise.all([
    inspectReadOnly(supabaseUrl), inspectReadOnly(neonUrl),
  ]);
  return compareReadOnlyInventories(supabase, neon);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await collectReadOnlyCutoverInventory(
      process.env.MOTOR_SUPABASE_AUDIT_DATABASE_URL,
      process.env.MOTOR_NEON_DATABASE_URL,
    );
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.cutoverApproved ? 0 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Database audit failed');
    process.exitCode = 1;
  }
}
