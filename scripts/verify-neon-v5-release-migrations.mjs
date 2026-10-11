import pg from 'pg';
import { MIGRATIONS } from './lib/neon-migration-plan.mjs';
import { verifyApprovedNeonPendingMigrations } from './lib/neon-v5-release-migration-gate.mjs';

const connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('MOTOR_NEON_DATABASE_URL or DATABASE_URL is required.');
const host = new URL(connectionString).hostname;
if (!host.endsWith('.neon.tech')) {
  throw new Error('V5 production release requires a verified Neon connection.');
}

const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
  application_name: 'motor-v5-release-migration-preflight',
});
try {
  const result = await pool.query('select migration_key from private.motor_neon_migrations');
  const pending = verifyApprovedNeonPendingMigrations({
    planned: MIGRATIONS,
    applied: result.rows.map((row) => row.migration_key),
  });
  console.log(JSON.stringify({
    status: 'approved',
    count: pending.length,
    pending, // No secrets; only reviewed, versioned migration paths.
  }));
} finally {
  await pool.end();
}
