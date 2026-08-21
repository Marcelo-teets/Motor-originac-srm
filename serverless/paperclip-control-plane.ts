import type { IncomingMessage, ServerResponse } from 'node:http';
import { createPlatformRepository } from '../backend/src/repositories/platformRepository.js';
import { PlatformService } from '../backend/src/services/platformService.js';
import { getSupabaseClient } from '../backend/src/lib/supabase.js';
import type { Owner } from '../backend/src/types/platform.js';

const RUNTIME = 'paperclip-control-plane-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TARGETS = new Set(['paper_clip', 'aba', 'adm']);
const ACTIONS = new Set(['recompute_company','refresh_monitoring_company','recompute_derived_all','process_reprocessing_queue','materialize_daily_outreach','create_task','run_suggested_improvements']);
const OWNERS = new Set<Owner>(['Origination','Coverage','Analytics','Intelligence','Credit','Unknown']);
type JsonObject = Record<string, unknown>;
type AuthenticatedUser = { id: string; email?: string };

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Origination-Runtime':RUNTIME,'X-Robots-Tag':'noindex'});
  res.end(JSON.stringify(payload));
};
const header = (req: IncomingMessage,key:string) => { const value=req.headers[key.toLowerCase()]; return Array.isArray(value)?value[0]:value; };
const text = (...values: unknown[]) => String(values.find((value) => typeof value === 'string' && value.trim()) ?? '').trim();
const asObject = (value: unknown): JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : {};
const readBody = async (req: IncomingMessage): Promise<JsonObject> => {
  const chunks: Buffer[]=[]; let bytes=0;
  for await (const chunk of req) { const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk); bytes+=buffer.length; if(bytes>256_000) throw Object.assign(new Error('Request body exceeds 256 KB.'),{statusCode:413}); chunks.push(buffer); }
  if(!chunks.length) return {};
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if(!value || typeof value!=='object' || Array.isArray(value)) throw Object.assign(new Error('JSON body must be an object.'),{statusCode:400});
  return value as JsonObject;
};
const requireAuth = async (req: IncomingMessage): Promise<AuthenticatedUser> => {
  const authorization=header(req,'authorization');
  if(!authorization?.startsWith('Bearer ')) throw Object.assign(new Error('Missing bearer token.'),{statusCode:401});
  const baseUrl=String(process.env.SUPABASE_URL??'').replace(/\/+$/,''); const anonKey=process.env.SUPABASE_ANON_KEY??'';
  if(!baseUrl||!anonKey) throw Object.assign(new Error('Supabase Auth is not configured.'),{statusCode:503});
  const response=await fetch(`${baseUrl}/auth/v1/user`,{headers:{apikey:anonKey,Authorization:authorization}});
  if(!response.ok) throw Object.assign(new Error('Unauthorized.'),{statusCode:401});
  const user=await response.json() as AuthenticatedUser;
  if(!UUID_PATTERN.test(user.id??'')) throw Object.assign(new Error('Authenticated user is invalid.'),{statusCode:401});
  return user;
};

const executeAction = async (action:string, context:JsonObject) => {
  const repository=createPlatformRepository('supabase'); const service=new PlatformService(repository); const client=getSupabaseClient();
  if(!client) throw new Error('Supabase service client unavailable.');
  const companyId=text(context.companyId,context.company_id);
  if(action==='recompute_company') { if(!UUID_PATTERN.test(companyId)) throw Object.assign(new Error('companyId is required.'),{statusCode:422}); const snapshot=await service.recomputeDerivedData(companyId); await client.rpc('refresh_ranking_v2',{}); return {companyId,qualifications:snapshot.qualifications.length,patterns:snapshot.patterns.length,scores:snapshot.scores.length,leadScores:snapshot.leadScores.length}; }
  if(action==='refresh_monitoring_company') { if(!UUID_PATTERN.test(companyId)) throw Object.assign(new Error('companyId is required.'),{statusCode:422}); await service.refreshMonitoring(companyId); return {companyId,monitoringRefreshed:true}; }
  if(action==='recompute_derived_all') { const snapshot=await service.recomputeDerivedData(); await client.rpc('refresh_ranking_v2',{}); return {qualifications:snapshot.qualifications.length,patterns:snapshot.patterns.length,scores:snapshot.scores.length,leadScores:snapshot.leadScores.length}; }
  if(action==='process_reprocessing_queue') { const limit=Math.max(1,Math.min(Number(context.limit??15)||15,50)); return {limit,result:await client.rpc('process_origination_reprocessing_queue',{p_limit:limit})}; }
  if(action==='materialize_daily_outreach') { const generatedOn=text(context.generatedOn,context.generated_on)||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); const limit=Math.max(1,Math.min(Number(context.limit??20)||20,50)); return {generatedOn,result:await client.rpc('materialize_dcm_daily_outreach',{p_generated_on:generatedOn,p_limit:limit}),autoSend:false}; }
  if(action==='create_task') { if(!UUID_PATTERN.test(companyId)) throw Object.assign(new Error('companyId is required.'),{statusCode:422}); const title=text(context.title); if(!title) throw Object.assign(new Error('task title is required.'),{statusCode:422}); const requestedOwner=text(context.owner) as Owner; const owner:Owner=OWNERS.has(requestedOwner)?requestedOwner:'Origination'; const item=await repository.saveTask({companyId,title,description:text(context.description),owner,status:'todo',dueDate:text(context.dueDate,context.due_date)||null}); return {item}; }
  if(action==='run_suggested_improvements') { const reprocessingLimit=Math.max(1,Math.min(Number(context.reprocessingLimit??15)||15,50)); const reprocessing=await client.rpc('process_origination_reprocessing_queue',{p_limit:reprocessingLimit}); const materialization=await client.rpc('materialize_dcm_daily_outreach',{p_generated_on:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),p_limit:20}); return {reprocessing,materialization,autoSend:false,note:'Paperclip coordinated existing Motor maintenance actions; no message was sent.'}; }
  throw Object.assign(new Error('Unsupported Paperclip action.'),{statusCode:400});
};

export default async function paperclipControlPlaneHandler(req:IncomingMessage,res:ServerResponse) {
  try {
    const user=await requireAuth(req); const client=getSupabaseClient();
    if(!client||!process.env.SUPABASE_SERVICE_ROLE_KEY) throw Object.assign(new Error('Paperclip persistence is not configured.'),{statusCode:503});
    const method=(req.method??'GET').toUpperCase();
    if(method==='GET') { const [statusRows,commands]=await Promise.all([client.select('paperclip_status_v',{select:'*'}),client.select('paperclip_commands',{select:'*',orderBy:{column:'created_at',ascending:false},limit:25})]); writeJson(res,200,{status:'real',generatedAt:new Date().toISOString(),data:{runtime:RUNTIME,status:statusRows?.[0]??{},commands}}); return; }
    if(method!=='POST') { writeJson(res,405,{status:'partial',error:'Method not allowed.'}); return; }
    const body=await readBody(req); const target=text(body.target,'paper_clip'); const action=text(body.action); const context=asObject(body.context);
    if(!TARGETS.has(target)) throw Object.assign(new Error('Invalid target.'),{statusCode:422});
    if(!ACTIONS.has(action)) throw Object.assign(new Error(`Unsupported action: ${action||'<empty>'}.`),{statusCode:422});
    const companyId=text(context.companyId,context.company_id); if(companyId&&!UUID_PATTERN.test(companyId)) throw Object.assign(new Error('Invalid companyId.'),{statusCode:422});
    const commandId=crypto.randomUUID(); const now=new Date().toISOString();
    await client.insert('paperclip_commands',[{id:commandId,target,action,company_id:companyId||null,requested_by:user.id,context,status:'queued',created_at:now}]);
    await client.update('paperclip_commands',{status:'running',started_at:new Date().toISOString()},[{column:'id',value:commandId}]);
    try { const result=await executeAction(action,context); const finishedAt=new Date().toISOString(); await client.update('paperclip_commands',{status:'completed',result,error:null,finished_at:finishedAt},[{column:'id',value:commandId}]); writeJson(res,200,{status:'real',generatedAt:finishedAt,data:{id:commandId,target,action,context,status:'completed',result,createdAt:now,finishedAt}}); }
    catch(error){ const finishedAt=new Date().toISOString(); const message=error instanceof Error?error.message:String(error); await client.update('paperclip_commands',{status:'failed',error:message,finished_at:finishedAt},[{column:'id',value:commandId}]); throw error; }
  } catch(error) {
    const statusCode=typeof error==='object'&&error!==null&&'statusCode' in error?Number((error as {statusCode?:unknown}).statusCode)||500:error instanceof SyntaxError?400:500;
    console.error('[paperclip-control-plane]',error); writeJson(res,statusCode,{status:'partial',generatedAt:new Date().toISOString(),error:error instanceof Error?error.message:String(error)});
  }
}
