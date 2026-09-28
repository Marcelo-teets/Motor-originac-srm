import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE,evaluate,usageFromProject,liveSnapshot,providerQuotaReasons } from './neon-free-budget-guard.mjs';

const baseline={storageBytes:250_000_000,computeHours:25,dataTransferBytes:1_000_000_000,branches:1,maxCu:1};

test('passes a project well below limits',()=> {
  assert.equal(evaluate(baseline).allowed,true);
});

test('hard stops at 85 percent before any plan ceiling',()=> {
  assert.equal(evaluate({...baseline,storageBytes:425_000_000}).allowed,false);
  assert.equal(evaluate({...baseline,computeHours:85}).allowed,false);
  assert.equal(evaluate({...baseline,dataTransferBytes:4_250_000_000}).allowed,false);
  assert.equal(evaluate({...baseline,branches:9}).allowed,false);
});

test('autoscale above 1 CU is blocked',()=> {
  assert.equal(evaluate({...baseline,maxCu:2}).allowed,false);
});

test('provider quotas must be present and no looser than policy',()=> {
  const project={settings:{quota:{
    logical_size_bytes:FREE.hardLogicalBytes,
    active_time_seconds:FREE.hardActiveSeconds,
    compute_time_seconds:FREE.hardComputeSeconds,
    data_transfer_bytes:FREE.hardTransferBytes,
  }}};
  assert.deepEqual(providerQuotaReasons(project),[]);
  assert.ok(providerQuotaReasons({settings:{quota:{}}}).length>=4);
  assert.ok(providerQuotaReasons({settings:{quota:{...project.settings.quota,logical_size_bytes:FREE.hardLogicalBytes+1}}}).includes('logical_size_hard_quota_missing_or_loose'));
});

test('usage takes conservative max of active and CPU based compute hours',()=> {
  assert.deepEqual(usageFromProject({
    synthetic_storage_size:30_000_000,
    compute_time_seconds:18_000,
    active_time_seconds:36_000,
    data_transfer_bytes:100,
  },1),{storageBytes:30_000_000,computeHours:10,dataTransferBytes:100});
});

test('read-only Neon API snapshot accepts hard quotas even if billing-period fields are absent',async()=> {
  const request=async url=>({
    ok:true,
    json:async()=>{
      if(url.endsWith('/endpoints')) return {endpoints:[{autoscaling_limit_max_cu:1}]};
      if(url.includes('/branches?')) return {branches:[{id:'a'}]};
      return {project:{
        id:FREE.projectId,
        owner:{subscription_type:'free_v3'},
        synthetic_storage_size:30_000_000,
        compute_time_seconds:1_000,
        active_time_seconds:1_000,
        data_transfer_bytes:1_000,
        settings:{quota:{
          logical_size_bytes:FREE.hardLogicalBytes,
          active_time_seconds:FREE.hardActiveSeconds,
          compute_time_seconds:FREE.hardComputeSeconds,
          data_transfer_bytes:FREE.hardTransferBytes,
        }},
      }};
    }
  });
  assert.equal((await liveSnapshot({key:'fixture',request})).allowed,true);
});

test('fails closed when provider hard quota drifts or project differs',async()=> {
  const request=async url=>({ok:true,json:async()=>url.includes('/branches?')?
    {branches:[]} : url.endsWith('/endpoints')?{endpoints:[]}:{project:{id:'other'}}});
  await assert.rejects(liveSnapshot({key:'fixture',request}),/unexpected Neon project/);
  assert.equal(evaluate({...baseline,extraReasons:['logical_size_hard_quota_missing_or_loose']}).allowed,false);
});
