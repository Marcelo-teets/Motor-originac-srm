import { readFileSync } from 'node:fs';
import pg from 'pg';
import { findUnsupportedSql, toNeonSql } from './lib/neon-sql-compat.mjs';
import { applyMigrationPatches } from './lib/neon-migration-patches.mjs';
import { MIGRATIONS } from './lib/neon-migration-plan.mjs';

const connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || '';
if (!connectionString) throw new Error('MOTOR_NEON_DATABASE_URL or DATABASE_URL is required.');

const migrations = MIGRATIONS;


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

    const source = applyMigrationPatches(file, readFileSync(file, 'utf8'));
    const unsupported = findUnsupportedSql(source);
    if (unsupported.length) {
      console.error('failed', file, `unsupported on Neon: ${unsupported.join('; ')}`);
      process.exitCode = 1;
      break;
    }
    const sql = toNeonSql(source);
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
