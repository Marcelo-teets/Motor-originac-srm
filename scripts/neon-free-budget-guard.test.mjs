import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE,evaluate,usageFromProject,liveSnapshot } from './neon-free-budget-guard.mjs';

const baseline={storageBytes:250_000_000,computeHours:25,branches:1,maxCu:1};
test('passes a project well below limits',()=>{
  assert.equal(evaluate(baseline).allowed,true);
});
test('hard stops at 85 percent, not the dangerously late 96 percent',()=>{
  assert.equal(evaluate({...baseline,storageBytes:425_000_000}).allowed,false);
  assert.equal(evaluate({...baseline,computeHours:85}).allowed,false);
  assert.equal(evaluate({...baseline,branches:9}).allowed,false);
});
test('autoscale above 1 CU is blocked to stay below 96% of 2 CU',()=>{
  assert.equal(evaluate({...baseline,maxCu:2}).allowed,false);
});
test('fail closed for missing or invalid billing data',()=>{
  assert.equal(evaluate({...baseline,computeHours:null}).allowed,false);
  assert.equal(evaluate({...baseline,storageBytes:NaN}).allowed,false);
  assert.equal(evaluate({...baseline,branches:null}).allowed,false);
});
test('do not misinterpret missing Free plan metrics as zero',()=>{
  assert.deepEqual(usageFromProject({}),{storageBytes:null,computeHours:null});
  assert.deepEqual(usageFromProject({consumption_period:{compute_time_seconds:18000,synthetic_storage_size:30000000}}),
    {storageBytes:30000000,computeHours:10});
});
test('read-only Neon API project, branches, endpoint snapshot',async()=>{
  const request=async url=>({
    ok:true, json:async()=>{
      if(url.endsWith('/endpoints')) return {endpoints:[{autoscaling_limit_max_cu:1}]};
      if(url.includes('/branches?')) return {branches:[{id:'a'}]};
      return {project:{id:FREE.projectId,owner:{subscription_type:'free_v3'},consumption_period_start:'2026-09-01T00:00:00Z',consumption_period_end:'2026-10-01T00:00:00Z',consumption_period:{compute_time_seconds:36000,synthetic_storage_size:30000000}}};
    }
  });
  assert.equal((await liveSnapshot({key:'fixture',request})).allowed,true);
});
test('project ID mismatch fails instead of checking another project',async()=>{
  const request=async url=>({ok:true,json:async()=>url.includes('/branches?')?
    {branches:[]} : url.endsWith('/endpoints')?{endpoints:[]}:{project:{id:'other'}}});
  await assert.rejects(liveSnapshot({key:'fixture',request}),/unexpected Neon project/);
});
