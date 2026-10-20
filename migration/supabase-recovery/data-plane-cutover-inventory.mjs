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
    // Catalog metadata only: detect historical FK deletion-policy drift before any cutover.
    const fkResult = await client.query(
      `select rel.relname as table_name, ref.relname as referenced_table,
        (select array_agg(a.attname order by k.ord)
         from unnest(c.conkey) with ordinality as k(attnum, ord)
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as columns,
        (select array_agg(a.attname order by k.ord)
         from unnest(c.confkey) with ordinality as k(attnum, ord)
         join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as referenced_columns,
        case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
          when 'c' then 'CASCADE' when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT' else 'UNKNOWN' end as on_delete
       from pg_constraint c
       join pg_class rel on rel.oid = c.conrelid
       join pg_namespace ns on ns.oid = rel.relnamespace
       join pg_class ref on ref.oid = c.confrelid
       where c.contype = 'f' and ns.nspname = 'public'
         and rel.relname = any($1::text[])
       order by rel.relname, ref.relname`,
      [TABLES],
    );
    for (const fk of fkResult.rows) {
      if (!tables[fk.table_name]) continue;
      tables[fk.table_name].foreignKeys ??= [];
      tables[fk.table_name].foreignKeys.push({
        columns: fk.columns, referencedTable: fk.referenced_table,
        referencedColumns: fk.referenced_columns, onDelete: fk.on_delete,
      });
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
    const fkIdentity = (fk) => JSON.stringify([
      fk.columns, fk.referencedTable, fk.referencedColumns,
    ]);
    const sbForeignKeys = new Map((sb.foreignKeys ?? []).map(fk => [fkIdentity(fk), fk.onDelete]));
    const neForeignKeys = new Map((ne.foreignKeys ?? []).map(fk => [fkIdentity(fk), fk.onDelete]));
    const foreignKeyDeleteDifferences = [...new Set([
      ...sbForeignKeys.keys(), ...neForeignKeys.keys(),
    ])].filter(key => sbForeignKeys.get(key) !== neForeignKeys.get(key))
      .map(key => ({
        relation: JSON.parse(key),
        supabase: sbForeignKeys.get(key) ?? null,
        neon: neForeignKeys.get(key) ?? null,
      }));
    return {
      table, supabasePresent: true, neonPresent: true,
      rowCounts: { supabase: sb.count, neon: ne.count },
      latestUpdated: { supabase: sb.lastUpdated, neon: ne.lastUpdated },
      supabaseOnly, neonOnly, changedType, foreignKeyDeleteDifferences,
      schemaMismatch: Boolean(supabaseOnly.length || neonOnly.length || changedType.length || foreignKeyDeleteDifferences.length),
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
