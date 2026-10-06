import pg from 'pg';
import { REQUIRED_FUNCTIONS, REQUIRED_RELATIONS } from './lib/neon-runtime-contract.mjs';

const connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || '';
if (!connectionString) {
  console.error('MOTOR_NEON_DATABASE_URL or DATABASE_URL is required.');
  process.exit(2);
}

const requiredRelations = REQUIRED_RELATIONS;
const requiredFunctions = REQUIRED_FUNCTIONS;

const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 15_000,
  application_name: 'motor-neon-runtime-parity',
});

try {
  const relationRows = await pool.query(
    `select requested.name,
            to_regclass(requested.name) is not null as present
       from unnest($1::text[]) as requested(name)`,
    [requiredRelations],
  );
  const functionRows = await pool.query(
    `select requested.schema_name,
            requested.function_name,
            exists (
              select 1
                from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = requested.schema_name
                 and p.proname = requested.function_name
            ) as present
       from unnest($1::text[], $2::text[]) as requested(schema_name, function_name)`,
    [
      requiredFunctions.map(([schema]) => schema),
      requiredFunctions.map(([, name]) => name),
    ],
  );

  const missingRelations = relationRows.rows.filter((row) => !row.present).map((row) => row.name);
  const missingFunctions = functionRows.rows
    .filter((row) => !row.present)
    .map((row) => `${row.schema_name}.${row.function_name}`);

  const report = {
    provider: 'neon',
    database: (await pool.query('select current_database() as name')).rows[0]?.name ?? 'unknown',
    relationsChecked: relationRows.rows.length,
    functionsChecked: functionRows.rows.length,
    missingRelations,
    missingFunctions,
    ready: missingRelations.length === 0 && missingFunctions.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
} finally {
  await pool.end();
}
