import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {audit,summaryMarkdown} from './neon-portability-audit.mjs';

test('identifies nonportable Supabase schemas, roles, cron and REST dependencies without data access', t=>{
  const root=mkdtempSync(join(tmpdir(),'motor-neon-audit-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'db','migrations'),{recursive:true});
  mkdirSync(join(root,'backend','src'),{recursive:true});
  writeFileSync(join(root,'db','schema.sql'),'CREATE TABLE companies (id text primary key);');
  writeFileSync(join(root,'db','migrations','001_canonical_init.sql'),'CREATE TABLE companies (id text primary key);');
  writeFileSync(join(root,'db','migrations','200_cron.sql'),[
    'SELECT cron.schedule($$SELECT 1$$);',
    'CREATE POLICY owned ON public.companies USING (auth.uid() = owner_id);',
    'GRANT SELECT ON public.companies TO authenticated;',
    'SELECT * FROM storage.objects;',
    'SELECT vault.create_secret(123);'
  ].join('\n'));
  writeFileSync(join(root,'backend','src','source.ts'),"const r = '/rest/v1/companies'; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;");
  const report=audit(root);
  assert.equal(report.status,'REQUIRES_SOURCE_DUMP_AND_PORTABILITY_REVIEW');
  assert.equal(report.sourceFiles.migrations,2);
  assert.equal(report.sqlDependencies.supabase_auth.count,1);
  assert.equal(report.sqlDependencies.supabase_storage.count,1);
  assert.equal(report.sqlDependencies.pg_cron.count,1);
  assert.equal(report.sqlDependencies.supabase_roles.count,1);
  assert.equal(report.runtimeDependencies.supabase_data_api.count,1);
  assert.match(summaryMarkdown(report),/Actual source dump recovered: \*\*not verified\*\*/);
});
test('never claims a clean static scan proves a production migration', t=>{
  const root=mkdtempSync(join(tmpdir(),'motor-neon-audit-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const report=audit(root);
  assert.equal(report.sourceFiles.migrations,0);
  assert.ok(report.requiredGates.includes('auth_users_and_jwt'));
  assert.match(summaryMarkdown(report),/not a live migration proof/);
});
