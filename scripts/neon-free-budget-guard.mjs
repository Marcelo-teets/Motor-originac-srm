// Motor Neon Free guard. No deletes, paid upgrades, or destructive SQL.
// Free plan per supplied 2026-09-24 screenshot: 500 MB, 100 CU-h/month,
// 10 branches, autoscaling up to 2 CU. Enforce conservative pre-limit stops.
export const FREE = Object.freeze({
  projectId: 'steep-poetry-38942951',
  storageBytes: 500_000_000,
  computeHours: 100,
  maxBranches: 10,
  maxCu: 2,
  target: 0.96,
  stopAt: 0.85, // early stop accommodates lag, ongoing writes and metric gaps
  maxAllowedBranches: 9,
  maxAutoscaleCu: 1,
});
export function finiteNonnegative(x) {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
}
export function evaluate({ storageBytes, computeHours, branches, maxCu, extraReasons=[] }) {
  const reasons=[...extraReasons];
  const storage=finiteNonnegative(storageBytes);
  const compute=finiteNonnegative(computeHours);
  const count=Number.isInteger(branches) && branches>=0?branches:null;
  const cu=finiteNonnegative(maxCu);
  if (storage===null) reasons.push('storage_metric_unavailable');
  if (compute===null) reasons.push('compute_metric_unavailable');
  if (count===null) reasons.push('branch_metric_unavailable');
  if (cu===null) reasons.push('compute_config_unavailable');
  if (storage!==null && storage>=FREE.storageBytes*FREE.stopAt) reasons.push('storage_headroom_low');
  if (compute!==null && compute>=FREE.computeHours*FREE.stopAt) reasons.push('compute_headroom_low');
  if (count!==null && count>=FREE.maxAllowedBranches) reasons.push('branch_headroom_low');
  if (cu!==null && cu>FREE.maxAutoscaleCu) reasons.push('compute_max_exceeds_guard');
  return {allowed:reasons.length===0, reasons, limits:FREE,
    observed:{storageBytes:storage,computeHours:compute,branches:count,maxCu:cu},
    utilization:{
      storage:storage===null?null:storage/FREE.storageBytes,
      compute:compute===null?null:compute/FREE.computeHours,
      branches:count===null?null:count/FREE.maxBranches,
      maxCu:cu===null?null:cu/FREE.maxCu
    }};
}
export function usageFromProject(p) {
  // Neon Free project payloads vary by vintage. Never treat missing metrics as zero.
  const c=p?.consumption_period??p?.consumption??{};
  const storage=[p?.synthetic_storage_size,c?.synthetic_storage_size,c?.data_storage_bytes,p?.data_storage_bytes].filter(x=>finiteNonnegative(x)!==null);
  const computeSeconds=finiteNonnegative(c?.compute_time_seconds??p?.compute_time_seconds);
  return {storageBytes:storage.length?Math.max(...storage):null,
    computeHours:computeSeconds===null?null:computeSeconds/3600};
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
  const usage=usageFromProject(project);
  return evaluate({...usage,branches:branches.length,maxCu});
}
async function main() {
  let result;
  try {
    result=await liveSnapshot({key:process.env.NEON_API_KEY,projectId:process.env.NEON_PROJECT_ID||FREE.projectId});
  } catch (error) {
    result=evaluate({storageBytes:null,computeHours:null,branches:null,maxCu:null,extraReasons:['neon_api_unavailable']});
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
