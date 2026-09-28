import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countFromContentRange, runExport } from './supabase-rest-export.mjs';
import { sqlForBatch, generateImportSql } from './neon-json-import-sql.mjs';
import { validateMigrationTable } from './neon-migration-manifest.mjs';

test('content-range parser extracts exact total',()=>{
  assert.equal(countFromContentRange('0-0/123'),123);
  assert.equal(countFromContentRange('*/0'),0);
  assert.equal(countFromContentRange('0-0/*'),null);
});

test('migration table validation rejects unsafe identifiers',()=>{
  assert.equal(validateMigrationTable('company_signals'),'company_signals');
  assert.throws(()=>validateMigrationTable('company_signals;drop table x'),/Invalid migration table/);
});

test('read-only exporter paginates and writes deterministic manifest',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'motor-export-'));
  const rows=[{id:'1',name:'A'},{id:'2',name:'B'},{id:'3',name:'C'}];
  const fetchImpl=async(_url,init)=>{
    const [from,to]=String(init.headers.Range).split('-').map(Number);
    const body=rows.slice(from,to+1);
    return new Response(JSON.stringify(body),{
      status:body.length?206:200,
      headers:{'content-range':body.length?`${from}-${from+body.length-1}/${rows.length}`:`*/${rows.length}`},
    });
  };
  const manifest=await runExport({
    baseUrl:'https://example.supabase.co',
    key:'secret-not-logged',
    tables:['companies'],
    outDir:dir,
    pageSize:2,
    fetchImpl,
  });
  assert.equal(manifest.tables[0].rowCount,3);
  const ndjson=await readFile(join(dir,'companies.ndjson'),'utf8');
  assert.equal(ndjson.trim().split('\n').length,3);
  assert.ok(!JSON.stringify(manifest).includes('secret-not-logged'));
});

test('import SQL uses typed target row and conflict-safe inserts',()=>{
  const sql=sqlForBatch({
    table:'companies',
    rows:[{id:'00000000-0000-0000-0000-000000000001',legal_name:'Empresa A',metadata:{x:1}}],
    batchIndex:0,
  });
  assert.match(sql,/jsonb_populate_recordset\(null::public\."companies"/i);
  assert.match(sql,/on conflict do nothing/i);
  assert.match(sql,/"legal_name"/);
});

test('generator refuses probe-only bundle',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'motor-import-'));
  await import('node:fs/promises').then(({writeFile})=>writeFile(
    join(dir,'manifest.json'),
    JSON.stringify({format:'motor-supabase-rest-export-v1',probe:true,tables:[]})
  ));
  await assert.rejects(
    generateImportSql({bundleDir:dir,outFile:join(dir,'out.sql')}),
    /Probe manifest cannot be imported/
  );
});
