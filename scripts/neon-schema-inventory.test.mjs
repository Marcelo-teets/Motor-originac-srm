import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classify, inventory } from './neon-schema-inventory.mjs';

test('Flags Supabase managed objects and cron, no automatic compatibility verdict',()=>{
  const row=classify('test.sql',"CREATE POLICY x ON public.companies USING(auth.uid()=id); SELECT cron.schedule('job','0 * * * *','select 1'); GRANT EXECUTE ON FUNCTION f() TO service_role;");
  assert.equal(row.category,'manual_compatibility_review');
  assert.deepEqual(row.flags.sort(),['pg_cron','privileges','security_or_rls','supabase_auth'].sort());
});
test('Even unflagged SQL is never claimed compatible',()=>{
  assert.equal(classify('safe.sql','CREATE TABLE public.foo (id int);').category,'not_verified');
});
test('Inventory lists migration files deterministically and marks schema as historical only',()=>{
  const root=mkdtempSync(join(tmpdir(),'motor-neon-inventory-'));
  try {
    mkdirSync(join(root,'db','migrations'),{recursive:true});
    writeFileSync(join(root,'db','schema.sql'),'CREATE TABLE public.legacy (id int);');
    writeFileSync(join(root,'db','migrations','002_risky.sql'),'CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    writeFileSync(join(root,'db','migrations','001_simple.sql'),'CREATE TABLE public.foo (id int);');
    const report=inventory(root);
    assert.equal(report.totalMigrations,2);
    assert.equal(report.reviewRequired,1);
    assert.equal(report.notVerified,1);
    assert.equal(report.migrations[0].file,'001_simple.sql');
    assert.equal(report.status,'STATIC_INVENTORY_ONLY');
    assert.ok(report.warning.includes('not proof'));
  } finally {rmSync(root,{recursive:true,force:true});}
});
