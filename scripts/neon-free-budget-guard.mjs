// Motor Neon Free guard. No deletes, paid upgrades, or destructive SQL.
// Live project: steep-poetry-38942951. Provider quotas are the primary hard stop.
export const FREE = Object.freeze({
  projectId: 'steep-poetry-38942951',
  storageBytes: 500_000_000,
  computeHours: 100,
  dataTransferBytes: 5_000_000_000,
  maxBranches: 10,
  maxPlanCu: 2,
  target: 0.96,
  stopAt: 0.85,
  maxAllowedBranches: 9,
  maxAutoscaleCu: 1,
  hardLogicalBytes: 480_000_000,
  hardActiveSeconds: 306_000,       // 85h across all computes
  hardComputeSeconds: 306_000,      // conservative CPU-seconds cap
  hardTransferBytes: 4_250_000_000, // 85% of 5 GB
});

export function finiteNonnegative(x) {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
}

export function providerQuotaReasons(project) {
  const q=project?.settings?.quota ?? {};
  const reasons=[];
  if(finiteNonnegative(q.logical_size_bytes)===null || q.logical_size_bytes>FREE.hardLogicalBytes)
    reasons.push('logical_size_hard_quota_missing_or_loose');
  if(finiteNonnegative(q.active_time_seconds)===null || q.active_time_seconds>FREE.hardActiveSeconds)
    reasons.push('active_time_hard_quota_missing_or_loose');
  if(finiteNonnegative(q.compute_time_seconds)===null || q.compute_time_seconds>FREE.hardComputeSeconds)
    reasons.push('compute_hard_quota_missing_or_loose');
  if(finiteNonnegative(q.data_transfer_bytes)===null || q.data_transfer_bytes>FREE.hardTransferBytes)
    reasons.push('transfer_hard_quota_missing_or_loose');
  return reasons;
}

export function evaluate({storageBytes,computeHours,dataTransferBytes,branches,maxCu,extraReasons=[]}) {
  const reasons=[...extraReasons];
  const storage=finiteNonnegative(storageBytes);
  const compute=finiteNonnegative(computeHours);
  const transfer=finiteNonnegative(dataTransferBytes);
  const count=Number.isInteger(branches)&&branches>=0?branches:null;
  const cu=finiteNonnegative(maxCu);
  if(storage===null) reasons.push('storage_metric_unavailable');
  if(compute===null) reasons.push('compute_metric_unavailable');
  if(transfer===null) reasons.push('transfer_metric_unavailable');
  if(count===null) reasons.push('branch_metric_unavailable');
  if(cu===null) reasons.push('compute_config_unavailable');
  if(storage!==null && storage>=FREE.storageBytes*FREE.stopAt) reasons.push('storage_headroom_low');
  if(compute!==null && compute>=FREE.computeHours*FREE.stopAt) reasons.push('compute_headroom_low');
  if(transfer!==null && transfer>=FREE.dataTransferBytes*FREE.stopAt) reasons.push('transfer_headroom_low');
  if(count!==null && count>=FREE.maxAllowedBranches) reasons.push('branch_headroom_low');
  if(cu!==null && cu>FREE.maxAutoscaleCu) reasons.push('compute_max_exceeds_guard');
  return {
    allowed:reasons.length===0,reasons,limits:FREE,
    observed:{storageBytes:storage,computeHours:compute,dataTransferBytes:transfer,branches:count,maxCu:cu},
    utilization:{
      storage:storage===null?null:storage/FREE.storageBytes,
      compute:compute===null?null:compute/FREE.computeHours,
      transfer:transfer===null?null:transfer/FREE.dataTransferBytes,
      branches:count===null?null:count/FREE.maxBranches,
      maxCu:cu===null?null:cu/FREE.maxPlanCu,
    },
  };
}

export function usageFromProject(p,maxCu=FREE.maxAutoscaleCu) {
  const storage=finiteNonnegative(p?.synthetic_storage_size);
  const cpuSeconds=finiteNonnegative(p?.compute_time_seconds);
  const activeSeconds=finiteNonnegative(p?.active_time_seconds);
  const transfer=finiteNonnegative(p?.data_transfer_bytes);
  const weightedActive=activeSeconds===null?null:(activeSeconds/3600)*Math.max(0.25,maxCu);
  const cpuHours=cpuSeconds===null?null:cpuSeconds/3600;
  const candidates=[weightedActive,cpuHours].filter(x=>x!==null);
  return {
    storageBytes:storage,
    computeHours:candidates.length?Math.max(...candidates):null,
    dataTransferBytes:transfer,
  };
}

export async function fetchNeon(url,key,request=fetch) {
  const response=await request('https://console.neon.tech/api/v2'+url,{
    headers:{Authorization:'Bearer '+key,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error('Neon API '+url+' returned HTTP '+response.status);
  return response.json();
}

export async function liveSnapshot({key,projectId=FREE.projectId,request=fetch}) {
  if(!key) throw new Error('NEON_API_KEY not configured');
  const id=encodeURIComponent(projectId);
  const [projectData,branchesData,endpointsData]=await Promise.all([
    fetchNeon('/projects/'+id,key,request),
    fetchNeon('/projects/'+id+'/branches?limit=100',key,request),
    fetchNeon('/projects/'+id+'/endpoints',key,request),
  ]);
  const project=projectData.project;
  if(project?.id!==projectId) throw new Error('unexpected Neon project');
  const branches=branchesData.branches;
  const endpoints=endpointsData.endpoints;
  if(!Array.isArray(branches)||!Array.isArray(endpoints)) throw new Error('Neon shape mismatch');
  const sizes=endpoints.map(e=>finiteNonnegative(e.autoscaling_limit_max_cu));
  const maxCu=sizes.some(x=>x===null)?null:Math.max(0,...sizes);
  const extraReasons=[];
  const subscription=project.owner?.subscription_type;
  if(typeof subscription!=='string'||!subscription.startsWith('free')) extraReasons.push('free_plan_not_verified');
  extraReasons.push(...providerQuotaReasons(project));
  const usage=usageFromProject(project,maxCu??FREE.maxAutoscaleCu);
  return evaluate({...usage,branches:branches.length,maxCu,extraReasons});
}

async function main() {
  let result;
  try {
    result=await liveSnapshot({key:process.env.NEON_API_KEY,projectId:process.env.NEON_PROJECT_ID||FREE.projectId});
  } catch(error) {
    result=evaluate({storageBytes:null,computeHours:null,dataTransferBytes:null,branches:null,maxCu:null,extraReasons:['neon_api_unavailable']});
    process.stderr.write('Neon guard: '+error.message+'\n');
  }
  const serialized=JSON.stringify({...result,checkedAt:new Date().toISOString()});
  process.stdout.write(serialized+'\n');
  if(process.env.GITHUB_OUTPUT) {
    const fs=await import('node:fs');
    fs.appendFileSync(process.env.GITHUB_OUTPUT,'allowed='+(result.allowed?'true':'false')+'\n');
    fs.appendFileSync(process.env.GITHUB_OUTPUT,'reasons='+result.reasons.join(',')+'\n');
  }
  if(!result.allowed) process.exitCode=2;
}
if(process.argv[1] && import.meta.url === new URL('file://'+process.argv[1]).href) await main();
