import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySupabaseRest, probeSupabaseRest } from './supabase-rest-health-classifier.mjs';

test('classifies known Supabase failure modes',()=>{
  assert.equal(classifySupabaseRest({status:200,body:'[]'}),'reachable');
  assert.equal(classifySupabaseRest({status:401,body:''}),'auth');
  assert.equal(classifySupabaseRest({status:404,body:''}),'missing_table_or_route');
  assert.equal(classifySupabaseRest({status:402,body:'exceed_db_size_quota'}),'quota');
  assert.equal(classifySupabaseRest({status:500,body:'Connection terminated due to connection timeout'}),'db_timeout');
  assert.equal(classifySupabaseRest({status:503,body:'upstream unavailable'}),'upstream_5xx');
  assert.equal(classifySupabaseRest({status:0,error:'operation timed out'}),'network_timeout');
  assert.equal(classifySupabaseRest({status:0,error:'socket reset'}),'network_error');
});

test('probe never exposes row payload and returns only status class',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify([{id:'secret-id',name:'secret-name'}]),{status:200});
  const result=await probeSupabaseRest({
    baseUrl:'https://example.supabase.co',
    key:'secret-key',
    table:'companies',
    fetchImpl,
  });
  assert.deepEqual(result,{table:'companies',class:'reachable',status:200});
  assert.ok(!JSON.stringify(result).includes('secret-id'));
  assert.ok(!JSON.stringify(result).includes('secret-key'));
});
