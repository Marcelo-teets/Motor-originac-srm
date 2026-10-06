import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { applyMigrationPatches, PATCHES } from './lib/neon-migration-patches.mjs';
import { MIGRATIONS, NOT_REPLAYED, PRODUCTION_APPLIED } from './lib/neon-migration-plan.mjs';
import { findUnsupportedSql, toNeonSql } from './lib/neon-sql-compat.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('production-recorded migrations stay first and unchanged', () => {
  assert.deepEqual(PRODUCTION_APPLIED, [
    'db/neon/20261005_neon_runtime_roles.sql',
    'db/migrations/035_capital_market_public_data.sql',
    'db/migrations/036_capital_market_dataset_runs_source_index.sql',
    'db/migrations/037_capital_market_incremental_checkpoints.sql',
    'db/migrations/044_capital_market_ingestion_health.sql',
    'db/migrations/060_origination_knowledge_vault.sql',
    'db/neon/20261005_neon_qualification_compatibility.sql',
    'db/neon/20261005_neon_signal_compatibility.sql',
  ]);
  assert.deepEqual(MIGRATIONS.slice(0, PRODUCTION_APPLIED.length), PRODUCTION_APPLIED);
});

test('every migration is planned exactly once or explicitly documented as not replayed', () => {
  assert.equal(new Set(MIGRATIONS).size, MIGRATIONS.length, 'duplicate plan entry');
  for (const file of MIGRATIONS) assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} is missing`);
  const all = [
    ...readdirSync(new URL('../db/migrations/', import.meta.url)).map((file) => `db/migrations/${file}`),
    ...readdirSync(new URL('../db/neon/', import.meta.url)).map((file) => `db/neon/${file}`),
  ].filter((file) => file.endsWith('.sql'));
  const unaccounted = all.filter((file) => !MIGRATIONS.includes(file) && !NOT_REPLAYED[file]);
  assert.deepEqual(unaccounted, []);
  for (const file of Object.keys(NOT_REPLAYED)) {
    assert.ok(!MIGRATIONS.includes(file), `${file} is both planned and excluded`);
    assert.ok(all.includes(file), `${file} documented but missing`);
  }
});

test('every planned migration patches cleanly and has no unsupported construct left', () => {
  for (const file of MIGRATIONS) {
    const patched = applyMigrationPatches(file, read(file));
    assert.deepEqual(findUnsupportedSql(patched), [], file);
  }
  for (const file of Object.keys(PATCHES)) assert.ok(MIGRATIONS.includes(file), `stale patch for ${file}`);
});

test('compat rewrites map legacy constructs to their Neon equivalents', () => {
  assert.equal(toNeonSql('select extensions.digest(x, \'sha256\'), y::extensions.vector(1024);'), 'select public.digest(x, \'sha256\'), y::public.vector(1024);');
  assert.equal(toNeonSql('create extension if not exists vector with schema extensions;'), 'create extension if not exists vector;');
  assert.equal(toNeonSql("if auth.role() = 'service_role' then"), "if (auth.session() ->> 'role') = 'service_role' then");
  assert.equal(toNeonSql('begin;\nselect 1;\ncommit;\n').trim(), 'select 1;');
});

test('legacy text source ids become the bootstrap uuid only in id-first source_catalog inserts', () => {
  const seed = "insert into public.source_catalog (id, name, metadata) values\n  ('src_a', 'A', '{\"code\":\"src_a\"}'),\n  (\n    'src_b', 'B', '{}')\non conflict (id) do nothing;\n";
  const rewritten = toNeonSql(seed);
  assert.match(rewritten, /\(private\.legacy_source_uuid\('src_a'\), 'A'/);
  assert.match(rewritten, /\(private\.legacy_source_uuid\('src_b'\), 'B'/);
  assert.match(rewritten, /"code":"src_a"/);

  const byCode = "insert into public.source_catalog (name, metadata)\nselect v.name, v.metadata from (values ('src_c', 'C')) v(code, name);\n";
  assert.equal(toNeonSql(byCode), byCode);
});

test('unsupported constructs are rejected unless guarded', () => {
  assert.deepEqual(findUnsupportedSql("select cron.schedule('x', '* * * * *', 'select 1');").length, 1);
  assert.deepEqual(findUnsupportedSql("do $$ begin if exists (select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('x','* * * * *','select 1'); end if; end $$;"), []);
  assert.equal(findUnsupportedSql('select decrypted_secret from vault.decrypted_secrets;').length, 1);
  assert.equal(findUnsupportedSql('select net.http_post(url := 1);').length, 1);
  assert.equal(findUnsupportedSql('references auth.users(id)').length, 1);
  assert.deepEqual(findUnsupportedSql('-- vault.decrypted_secrets is mentioned only in a comment\nselect 1;'), []);
});

test('patches fail loudly when the migration text drifts', () => {
  const [file] = Object.keys(PATCHES);
  assert.throws(() => applyMigrationPatches(file, 'select 1;'), /no longer matches/);
});
