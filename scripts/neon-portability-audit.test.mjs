import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {classify, inventory} from './neon-portability-audit.mjs';

test('identifies managed Supabase dependencies without running migration', () => {
  const out = classify('sample.sql', 'CREATE POLICY x ON public.test USING (auth.uid() = owner_id); SELECT cron.schedule(\'x\',\'* * * * *\',\'x\');');
  assert.deepEqual(out.tags.sort(), ['auth','cron','rls']);
});
test('inventory refuses to claim automatic schema portability', () => {
  const dir=mkdtempSync(join(tmpdir(), 'motor-neon-'));
  try {
    mkdirSync(join(dir, 'db','migrations'),{recursive:true});
    writeFileSync(join(dir,'db','migrations','001_create.sql'),'CREATE TABLE public.x (id uuid PRIMARY KEY);');
    writeFileSync(join(dir,'db','migrations','002_auth.sql'),'CREATE POLICY x ON public.x USING (auth.uid() IS NOT NULL);');
    const r=inventory(dir);
    assert.equal(r.totalMigrations,2);
    assert.equal(r.summary.auth,1);
    assert.equal(r.safeToApplyAutomatically,false);
    assert.equal(r.manualReview.length,1);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('missing migration directory is a hard failure',()=> {
  const dir=mkdtempSync(join(tmpdir(),'motor-neon-'));
  try {assert.throws(()=>inventory(dir),/Missing db\/migrations/);}
  finally {rmSync(dir,{recursive:true,force:true});}
});
