import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countFromContentRange, fetchPage, runExport } from './supabase-rest-export.mjs';
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

test('REST pages use deterministic primary-key ordering',async()=>{
  let order='';
  await fetchPage({
    baseUrl:'https://example.supabase.co',key:'test',table:'companies',offset:0,pageSize:2,
    fetchImpl:async(url)=>{
      order=url.searchParams.get('order');
      return new Response('[]',{status:200,headers:{'content-range':'*/0'}});
    },
  });
  assert.equal(order,'id.asc');

  await fetchPage({
    baseUrl:'https://example.supabase.co',key:'test',table:'external_api_usage_monthly',offset:0,pageSize:2,
    fetchImpl:async(url)=>{
      order=url.searchParams.get('order');
      return new Response('[]',{status:200,headers:{'content-range':'*/0'}});
    },
  });
  assert.equal(order,'provider.asc,month_key.asc');
});

test('read-only exporter paginates, verifies final count and writes deterministic manifest',async()=>{
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
  assert.deepEqual(manifest.tables[0].primaryKey,['id']);
  const ndjson=await readFile(join(dir,'companies.ndjson'),'utf8');
  assert.equal(ndjson.trim().split('\n').length,3);
  assert.ok(!JSON.stringify(manifest).includes('secret-not-logged'));
});

test('export aborts if paginated source returns duplicate primary keys',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'motor-duplicate-'));
  const rows=[{id:'1'},{id:'1'}];
  const fetchImpl=async(_url,init)=>{
    const [from,to]=String(init.headers.Range).split('-').map(Number);
    const body=rows.slice(from,to+1);
    return new Response(JSON.stringify(body),{
      status:body.length?206:200,
      headers:{'content-range':body.length?`${from}-${from+body.length-1}/2`:'*/2'},
    });
  };
  await assert.rejects(
    runExport({baseUrl:'https://example.supabase.co',key:'secret',tables:['companies'],outDir:dir,pageSize:1,fetchImpl}),
    /Duplicate primary key/
  );
});

test('import SQL uses typed target row and conflict-safe inserts',()=>{
  const sql=sqlForBatch({
    table:'companies',
    rows:[{id:'00000000-0000-0000-0000-000000000001',legal_name:'Empresa A',metadata:{x:1}}],
    batchIndex:0,
  });
  assert.match(sql,/jsonb_populate_recordset\(null::public\."companies"/i);
  assert.match(sql,/where true\s+on conflict do nothing/i);
  assert.match(sql,/"legal_name"/);
});

test('final-delta SQL explicitly upserts by source primary key',()=>{
  const sql=sqlForBatch({
    table:'companies',
    rows:[{id:'00000000-0000-4000-8000-000000000001',legal_name:'updated'}],
    batchIndex:0,
    upsert:true,
  });
  assert.match(sql,/where true\s+on conflict \("id"\) do update set/i);
  assert.match(sql,/"legal_name"=excluded\."legal_name"/);

  const composite=sqlForBatch({
    table:'external_api_usage_monthly',
    rows:[{provider:'example',month_key:'2026-09',used_count:2}],
    batchIndex:0,
    upsert:true,
  });
  assert.match(composite,/on conflict \("provider","month_key"\) do update set/i);
});

test('generator refuses probe-only bundle',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'motor-import-'));
  await writeFile(
    join(dir,'manifest.json'),
    JSON.stringify({format:'motor-supabase-rest-export-v1',probe:true,tables:[]})
  );
  await assert.rejects(
    generateImportSql({bundleDir:dir,outFile:join(dir,'out.sql')}),
    /Probe manifest cannot be imported/
  );
});

test('import rejects corrupted data and incomplete manifests',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'motor-hash-'));
  const data='{"id":"123"}\n';
  await writeFile(join(dir,'companies.ndjson'),data);
  await writeFile(join(dir,'manifest.json'),JSON.stringify({
    format:'motor-supabase-rest-export-v1',
    probe:false,
    tables:[{table:'companies',file:'companies.ndjson',rowCount:1,sha256:'0'.repeat(64)}],
  }));
  await assert.rejects(
    generateImportSql({bundleDir:dir,outFile:join(dir,'out.sql'),tables:['companies']}),
    /SHA-256 mismatch/
  );

  const hash=createHash('sha256').update(data).digest('hex');
  await writeFile(join(dir,'manifest.json'),JSON.stringify({
    format:'motor-supabase-rest-export-v1',
    probe:false,
    tables:[{table:'companies',file:'companies.ndjson',rowCount:1,sha256:hash}],
  }));
  await assert.rejects(
    generateImportSql({bundleDir:dir,outFile:join(dir,'out.sql'),tables:['source_catalog']}),
    /Missing required export/
  );
});
