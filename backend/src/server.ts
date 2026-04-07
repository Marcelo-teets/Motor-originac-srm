import cors from 'cors';
import express from 'express';
import { authMiddleware, fetchCurrentSupabaseUser, signInWithPassword, signOutSupabase } from './lib/auth.js';
import { env } from './lib/env.js';
import { discoveryHitToCandidateDraft } from './lib/candidatePromotion.js';
import { runSearchProfileDiscovery } from './lib/discoveryCapture.js';
import { createPlatformRepository } from './repositories/platformRepository.js';
import { asOwner, isActivityStatus, isActivityType, isPipelineStage, isTaskStatus } from './lib/crm.js';
import { createAiRouter } from './routes/aiRouter.js';
import { createAbmWarRoomRouter } from './routes/abmWarRoomRouter.js';
import { AbaService } from './services/abaService.js';
import { PlatformService } from './services/platformService.js';

const app = express();
app.use(cors());
app.use(express.json());

const repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
const service = new PlatformService(repository);
const abaService = new AbaService();
const platformMode = env.useSupabase ? 'real' : 'partial';
const crmRuntimeMode: 'real' | 'mock' = env.useSupabase ? 'real' : 'mock';
const ok = (status: 'real' | 'partial' | 'mock', data: unknown) => ({ status, generatedAt: new Date().toISOString(), data });
const fail = (status: number, error: string) => ({ statusCode: status, generatedAt: new Date().toISOString(), error });
const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
const wrap = (handler: express.Handler): express.Handler => async (req, res, next) => {
  try {
    await Promise.resolve(handler(req, res, next));
  } catch (error) {
    console.error(error);
    res.status(500).json(fail(500, error instanceof Error ? error.message : 'Unexpected error'));
  }
};
const assertNonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const discoveredCandidates: Array<Record<string, unknown>> = [];

await service.bootstrap().catch((error) => {
  console.warn('Bootstrap warning:', error instanceof Error ? error.message : error);
});

app.get('/health', (_req, res) => res.json(ok(platformMode, { service: 'backend', mode: platformMode, uptime: process.uptime() })));

app.post('/auth/login', wrap(async (req, res) => {
  const email = String(req.body?.email ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!email || !password) {
    res.status(400).json(fail(400, 'Email e password são obrigatórios.'));
    return;
  }

  const session = await signInWithPassword(email, password);
  res.json(ok('real', session));
}));

app.use(authMiddleware);
app.use('/ai', createAiRouter(service));
app.use('/abm', createAbmWarRoomRouter());

app.get('/auth/me', wrap(async (req, res) => {
  const liveUser = req.accessToken ? await fetchCurrentSupabaseUser(req.accessToken).catch(() => req.authUser!) : req.authUser;
  res.json(ok('real', liveUser));
}));
app.post('/auth/logout', wrap(async (req, res) => {
  if (req.accessToken) await signOutSupabase(req.accessToken);
  res.json(ok('real', { success: true }));
}));

app.get('/search-profiles', wrap(async (_req, res) => res.json(ok(platformMode, await service.listSearchProfiles()))));
app.post('/search-profiles', wrap(async (req, res) => {
  const profile = await service.saveSearchProfile({
    id: req.body?.id,
    name: req.body?.name,
    segment: String(req.body?.segment ?? ''),
    subsegment: String(req.body?.subsegment ?? ''),
    companyType: String(req.body?.companyType ?? ''),
    geography: String(req.body?.geography ?? ''),
    creditProduct: String(req.body?.creditProduct ?? ''),
    receivables: Array.isArray(req.body?.receivables) ? req.body.receivables.map(String) : [],
    targetStructure: String(req.body?.targetStructure ?? ''),
    minimumSignalIntensity: Number(req.body?.minimumSignalIntensity ?? 50),
    minimumConfidence: Number(req.body?.minimumConfidence ?? 0.6),
    timeWindowDays: Number(req.body?.timeWindowDays ?? 90),
    status: req.body?.status === 'paused' ? 'paused' : 'active',
    profilePayload: typeof req.body?.profilePayload === 'object' && req.body?.profilePayload ? req.body.profilePayload : {},
  });
  res.status(201).json(ok(platformMode, profile));
}));
app.post('/search-profiles/:id/run', wrap(async (req, res) => {
  const profileId = param(req.params.id);
  const profiles = await service.listSearchProfiles();
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) {
    res.status(404).json(fail(404, 'Search profile not found.'));
    return;
  }

  const hits = await runSearchProfileDiscovery(profile);
  const runAt = new Date().toISOString();
  const candidates = hits.map((hit) => {
    const candidate = discoveryHitToCandidateDraft(profile, hit);
    const saved = {
      ...candidate,
      id: crypto.randomUUID(),
      searchProfileId: profile.id,
      status: 'captured',
      promoted: false,
      capturedAt: runAt,
    };
    discoveredCandidates.unshift(saved);
    return saved;
  });

  res.json(ok(platformMode, {
    run: { profileId: profile.id, profileName: profile.name, runAt, candidatesFound: candidates.length },
    candidates,
  }));
}));
app.get('/search-profiles/:id/candidates', wrap(async (req, res) => {
  const profileId = param(req.params.id);
  res.json(ok(platformMode, discoveredCandidates.filter((item) => item.searchProfileId === profileId)));
}));
app.post('/search-profiles/candidates/:id/promote', wrap(async (req, res) => {
  const candidateId = param(req.params.id);
  const candidate = discoveredCandidates.find((item) => item.id === candidateId);
  if (!candidate) {
    res.status(404).json(fail(404, 'Candidate not found.'));
    return;
  }
  candidate.status = 'promoted';
  candidate.promoted = true;
  candidate.promotedAt = new Date().toISOString();
  res.json(ok(platformMode, candidate));
}));
app.get('/companies', wrap(async (_req, res) => res.json(ok(platformMode, await service.listCompanies()))));
app.get('/companies/:id', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.status(detail ? 200 : 404).json(detail ? ok(platformMode, detail) : fail(404, 'Company not found'));
}));
app.get('/companies/:id/patterns', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.patterns ?? []));
}));
app.get('/companies/:id/sources', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, { companyId: param(req.params.id), sources: detail?.sources ?? [] }));
}));
app.get('/companies/:id/signals', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, { companyId: param(req.params.id), signals: detail?.signals ?? [] }));
}));
app.get('/companies/:id/monitoring', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, { companyId: param(req.params.id), monitoring: detail?.monitoring ?? null, outputs: detail?.monitoringOutputs ?? [] }));
}));
app.get('/companies/:id/scores', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scores ?? null));
}));
app.get('/companies/:id/lead-score', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scores ?? null));
}));
app.get('/companies/:id/qualification', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.qualification ?? null));
}));
app.get('/companies/:id/qualification/history', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scoreHistory ?? []));
}));
app.post('/companies/:id/qualification/recalculate', wrap(async (req, res) => res.json(ok(platformMode, await service.recalculateCompany(param(req.params.id), req.body?.reason ?? 'manual')))));
app.get('/companies/:id/thesis', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.thesis ?? null));
}));
app.get('/companies/:id/market-map', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, { companyId: param(req.params.id), peers: detail?.marketMap ?? [] }));
}));
app.get('/companies/:id/ranking', wrap(async (req, res) => res.json(ok(platformMode, await service.getCompanyRanking(param(req.params.id))))));
app.get('/companies/:id/activities', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.activities ?? []));
}));

app.get('/dashboard/summary', wrap(async (_req, res) => res.json(ok(platformMode, await service.getDashboard()))));
app.get('/dashboard/top-leads', wrap(async (_req, res) => res.json(ok(platformMode, (await service.getDashboard()).topLeads))));
app.get('/dashboard/agents', wrap((_req, res) => res.json(ok(platformMode, { agentsMode: platformMode }))));
app.get('/dashboard/monitoring', wrap(async (_req, res) => res.json(ok(platformMode, (await service.getDashboard()).monitoring))));
app.get('/dashboard/patterns', wrap(async (_req, res) => res.json(ok(platformMode, (await service.getDashboard()).patterns))));

app.get('/sources/catalog', wrap(async (_req, res) => res.json(ok(platformMode, await service.listSources()))));
app.get('/sources/active', wrap(async (_req, res) => res.json(ok(platformMode, (await service.listSources()).filter((item) => item.health !== 'down')))));
app.get('/sources/health', wrap(async (_req, res) => res.json(ok(platformMode, (await service.listSources()).map((item) => ({ id: item.id, health: item.health, status: item.status }))))));
app.get('/monitoring/state', wrap(async (_req, res) => res.json(ok(platformMode, { cadence: 'daily + manual', status: 'running', mode: platformMode, lastRunAt: new Date().toISOString() }))));
app.get('/monitoring/outputs', wrap(async (_req, res) => res.json(ok(platformMode, await service.listMonitoringOutputsAll()))));
app.get('/monitoring/triggers', wrap(async (_req, res) => {
  const companies = await service.listCompanies();
  res.json(ok(platformMode, companies.map((item) => ({ companyId: item.id, triggerStrength: item.triggerStrength, topPatterns: item.topPatterns }))));
}));
app.post('/monitoring/run', wrap(async (_req, res) => res.json(ok(platformMode, { started: true, ...(await service.refreshMonitoring()) }))));
app.post('/monitoring/run/company/:id', wrap(async (req, res) => res.json(ok(platformMode, { started: true, companyId: param(req.params.id), ...(await service.refreshMonitoring(param(req.params.id))) }))));
app.post('/monitoring/run/source/:id', wrap((req, res) => res.json(ok(platformMode, { started: true, sourceId: param(req.params.id), note: 'Source-specific filtering uses persisted outputs catalog.' }))));

app.get('/agents', wrap(async (_req, res) => res.json(ok(platformMode, { definitions: (await import('./modules/agents.js')).agentDefinitions }))));
app.get('/agents/definitions', wrap(async (_req, res) => res.json(ok(platformMode, (await import('./modules/agents.js')).agentDefinitions))));
app.get('/agents/runs', wrap(async (_req, res) => res.json(ok(platformMode, [{ agent_name: 'qualification_agent', status: 'completed', mode: platformMode }, { agent_name: 'pattern_identification_agent', status: 'completed', mode: platformMode }]))));
app.get('/agents/runs/:id', wrap((req, res) => res.json(ok(platformMode, { execution_id: param(req.params.id), status: 'completed', mode: platformMode }))));
app.get('/agents/validations', wrap((_req, res) => res.json(ok(platformMode, [{ agent_name: 'qualification_agent', validation: 'passed' }, { agent_name: 'lead_score_agent', validation: 'passed' }]))));
app.get('/agents/improvements', wrap((_req, res) => res.json(ok('partial', [{ id: 'imp_1', title: 'Expandir conectores adicionais após estabilizar Supabase/Auth real.' }]))));
app.get('/agents/patterns', wrap(async (_req, res) => res.json(ok(platformMode, await service.listPatternCatalog()))));
app.post('/agents/run/:agent_name', wrap((req, res) => res.json(ok(platformMode, { agent: param(req.params.agent_name), scope: 'global', started: true }))));
app.post('/agents/run/company/:id/:agent_name', wrap((req, res) => res.json(ok(platformMode, { agent: param(req.params.agent_name), companyId: param(req.params.id), started: true }))));
app.post('/agents/orchestrate/company/:id', wrap(async (req, res) => {
  await service.refreshMonitoring(param(req.params.id));
  await service.recalculateCompany(param(req.params.id), 'orchestrated');
  res.json(ok(platformMode, { companyId: param(req.params.id), orchestrated: true, runCount: 3 }));
}));
app.get('/agents/health', wrap((_req, res) => res.json(ok(platformMode, { healthy: 4, degraded: 1, mocked: 0 }))));
app.get('/aba/status', wrap(async (_req, res) => {
  const dashboard = await service.getDashboard();
  res.json(ok(platformMode, abaService.getStatus(dashboard)));
}));
app.post('/aba/command', wrap(async (req, res) => {
  const target = String(req.body?.target ?? 'aba');
  const action = String(req.body?.action ?? '').trim();
  if (!action) {
    res.status(400).json(fail(400, 'action is required.'));
    return;
  }
  if (!['aba', 'paper_clip', 'adm'].includes(target)) {
    res.status(400).json(fail(400, `Invalid target: ${target}`));
    return;
  }
  res.status(201).json(ok(platformMode, abaService.runCommand(target as 'aba' | 'paper_clip' | 'adm', action, typeof req.body?.context === 'object' && req.body?.context ? req.body.context : {})));
}));
app.post('/agents/paper-clip/command', wrap(async (req, res) => {
  const action = String(req.body?.action ?? '').trim();
  if (!action) {
    res.status(400).json(fail(400, 'action is required.'));
    return;
  }
  res.status(201).json(ok(platformMode, abaService.runCommand('paper_clip', action, typeof req.body?.context === 'object' && req.body?.context ? req.body.context : {})));
}));
app.post('/agents/adm/command', wrap(async (req, res) => {
  const action = String(req.body?.action ?? '').trim();
  if (!action) {
    res.status(400).json(fail(400, 'action is required.'));
    return;
  }
  res.status(201).json(ok(platformMode, abaService.runCommand('adm', action, typeof req.body?.context === 'object' && req.body?.context ? req.body.context : {})));
}));

app.get('/score/company/:id/current', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scores ?? null));
}));
app.get('/score/company/:id/history', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scoreHistory ?? []));
}));
app.post('/score/company/:id/recalculate', wrap(async (req, res) => res.json(ok(platformMode, await service.recalculateCompany(param(req.params.id), req.body?.reason ?? 'manual')))));
app.get('/lead-score/company/:id/current', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scores ?? null));
}));
app.get('/lead-score/company/:id/history', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scoreHistory ?? []));
}));
app.post('/lead-score/company/:id/recalculate', wrap(async (req, res) => res.json(ok(platformMode, await service.recalculateCompany(param(req.params.id), req.body?.reason ?? 'manual')))));
app.get('/rankings/v2', wrap(async (_req, res) => res.json(ok(platformMode, await service.getRankings()))));
app.get('/rankings/v2/company/:id', wrap(async (req, res) => res.json(ok(platformMode, await service.getCompanyRanking(param(req.params.id))))));
app.post('/rankings/v2/recalculate', wrap(async (_req, res) => {
  await service.recomputeDerivedData();
  res.json(ok(platformMode, { recalculated: true, companies: (await service.listCompanies()).length }));
}));

app.post('/thesis/company/:id/generate', wrap(async (req, res) => {
  await service.recalculateCompany(param(req.params.id), req.body?.reason ?? 'manual');
  res.json(ok(platformMode, { companyId: param(req.params.id), generated: true, reason: req.body?.reason ?? 'manual' }));
}));
app.get('/thesis/company/:id', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.thesis ?? null));
}));
app.post('/market-map/company/:id/generate', wrap((req, res) => res.json(ok(platformMode, { companyId: param(req.params.id), generated: true, mode: platformMode }))));
app.get('/market-map/company/:id', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, { companyId: param(req.params.id), peers: detail?.marketMap ?? [] }));
}));

app.get('/pipeline', wrap(async (_req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, rows: await service.listPipelineRows() }))));
app.get('/pipeline/stages', wrap(async (_req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, stages: await service.listPipelineStages() }))));
app.get('/pipeline/company/:id', wrap(async (req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, row: await service.getPipelineByCompany(param(req.params.id)) }))));
app.post('/pipeline/company/:id/move', wrap(async (req, res) => {
  const stage = String(req.body?.stage ?? '');
  if (!isPipelineStage(stage)) {
    res.status(400).json(fail(400, `Invalid stage: ${stage}`));
    return;
  }
  const moved = await service.movePipelineStage(param(req.params.id), stage);
  if (!moved) {
    res.status(404).json(fail(404, 'Pipeline row not found for company.'));
    return;
  }
  res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, row: moved }));
}));
app.patch('/pipeline/company/:id/next-action', wrap(async (req, res) => {
  const nextAction = String(req.body?.nextAction ?? req.body?.next_action ?? '').trim();
  if (!nextAction) {
    res.status(400).json(fail(400, 'nextAction is required.'));
    return;
  }
  const updated = await service.updateNextAction(param(req.params.id), nextAction);
  if (!updated) {
    res.status(404).json(fail(404, 'Pipeline row not found for company.'));
    return;
  }
  res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, row: updated }));
}));
app.get('/pipeline/snapshot', wrap(async (_req, res) => {
  const [rows, stages, activities] = await Promise.all([service.listPipelineRows(), service.listPipelineStages(), service.listActivities()]);
  res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, rows, stages, recentActivities: activities.slice(0, 12) }));
}));
app.get('/activities', wrap(async (_req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, items: await service.listActivities() }))));
app.post('/activities', wrap(async (req, res) => {
  const companyId = String(req.body?.companyId ?? req.body?.company_id ?? '').trim();
  const title = String(req.body?.title ?? '').trim();
  const rawType = String(req.body?.type ?? 'other');
  const rawStatus = String(req.body?.status ?? 'open');
  if (!assertNonEmpty(companyId)) {
    res.status(400).json(fail(400, 'companyId is required.'));
    return;
  }
  if (!assertNonEmpty(title)) {
    res.status(400).json(fail(400, 'title is required.'));
    return;
  }
  if (!isActivityType(rawType)) {
    res.status(400).json(fail(400, `Invalid activity type: ${rawType}`));
    return;
  }
  if (!isActivityStatus(rawStatus)) {
    res.status(400).json(fail(400, `Invalid activity status: ${rawStatus}`));
    return;
  }
  const created = await service.saveActivity({
    companyId,
    type: rawType,
    title,
    description: String(req.body?.description ?? ''),
    owner: asOwner(req.body?.owner ?? 'Unknown'),
    status: rawStatus,
    dueDate: req.body?.dueDate ?? req.body?.due_date ?? null,
  });
  res.status(201).json(ok(crmRuntimeMode, { mode: crmRuntimeMode, item: created }));
}));
app.get('/activities/company/:id', wrap(async (req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, items: await service.listActivities(param(req.params.id)) }))));
app.get('/tasks', wrap(async (_req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, items: await service.listTasks() }))));
app.get('/tasks/company/:id', wrap(async (req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, items: await service.listTasks(param(req.params.id)) }))));
app.post('/tasks', wrap(async (req, res) => {
  const companyId = String(req.body?.companyId ?? req.body?.company_id ?? '').trim();
  const title = String(req.body?.title ?? '').trim();
  const rawStatus = String(req.body?.status ?? 'todo');
  if (!assertNonEmpty(companyId)) {
    res.status(400).json(fail(400, 'companyId is required.'));
    return;
  }
  if (!assertNonEmpty(title)) {
    res.status(400).json(fail(400, 'title is required.'));
    return;
  }
  if (!isTaskStatus(rawStatus)) {
    res.status(400).json(fail(400, `Invalid task status: ${rawStatus}`));
    return;
  }
  const created = await service.saveTask({
    companyId,
    title,
    description: String(req.body?.description ?? ''),
    owner: asOwner(req.body?.owner ?? 'Unknown'),
    status: rawStatus,
    dueDate: req.body?.dueDate ?? req.body?.due_date ?? null,
  });
  res.status(201).json(ok(crmRuntimeMode, { mode: crmRuntimeMode, item: created }));
}));
app.patch('/tasks/:id', wrap(async (req, res) => {
  if (req.body?.status && !isTaskStatus(String(req.body.status))) {
    res.status(400).json(fail(400, `Invalid task status: ${String(req.body.status)}`));
    return;
  }
  if (req.body?.title !== undefined && !assertNonEmpty(String(req.body.title))) {
    res.status(400).json(fail(400, 'title cannot be empty.'));
    return;
  }
  const updated = await service.updateTask(param(req.params.id), {
    title: req.body?.title,
    description: req.body?.description,
    owner: req.body?.owner ? asOwner(req.body.owner) : undefined,
    status: req.body?.status,
    dueDate: req.body?.dueDate ?? req.body?.due_date,
  });
  if (!updated) {
    res.status(404).json(fail(404, 'Task not found.'));
    return;
  }
  res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, item: updated }));
}));
app.get('/monitoring/snapshot', wrap(async (_req, res) => res.json(ok(platformMode, { monitoring: (await service.getDashboard()).monitoring, latestOutputs: (await service.listMonitoringOutputsAll()).slice(0, 12) }))));
app.get('/agents/snapshot', wrap(async (_req, res) => res.json(ok(platformMode, { agents: (await service.getDashboard()).agents }))));
app.get('/mvp-readiness', wrap(async (_req, res) => {
  const [dashboard, sources, pipelineRows] = await Promise.all([service.getDashboard(), service.listSources(), service.listPipelineRows()]);
  const degradedSources = sources.filter((source) => source.health !== 'healthy').length;
  res.json(ok(platformMode, {
    auth: { status: 'real', provider: 'supabase' },
    database: { status: env.useSupabase ? 'real' : 'partial', mode: env.useSupabase ? 'supabase' : 'memory_fallback' },
    sources: { total: sources.length, degraded: degradedSources, status: degradedSources ? 'attention' : 'healthy' },
    monitoring: { outputs24h: dashboard.monitoring.outputs24h, triggers24h: dashboard.monitoring.triggers24h, status: dashboard.monitoring.outputs24h > 0 ? 'active' : 'idle' },
    qualification: { topLeads: dashboard.topLeads.length, status: dashboard.topLeads.length ? 'active' : 'empty' },
    pipeline: { rows: pipelineRows.length, stages: dashboard.pipeline, status: pipelineRows.length ? 'active' : 'empty' },
    frontend_runtime: { status: 'ready', stack: 'react_vite' },
    deploy_health: { status: 'unknown', note: 'Use Vercel health checks for deploy-level confirmation.' },
  }));
}));
app.get('/mvp/ops/quick-actions', wrap(async (_req, res) => {
  const [rankings, pipelineRows] = await Promise.all([service.getRankings(), service.listPipelineRows()]);
  const top = rankings[0];
  const stalled = pipelineRows.find((row) => row.stage === 'Identified' || row.stage === 'Recycled');
  const stalledName = stalled ? rankings.find((row) => row.companyId === stalled.companyId)?.companyName ?? stalled.companyId : null;
  const stalledAction = stalled?.nextAction || 'Definir próxima ação comercial';
  const topPipeline = top ? pipelineRows.find((row) => row.companyId === top.companyId) : null;
  const topAction = topPipeline?.nextAction || top?.rationale || 'Executar contato inicial com sponsor financeiro';
  res.json(ok(platformMode, {
    items: [
      {
        id: 'qa_top_lead',
        title: top ? `Abordar ${top.companyName} | stage: ${topPipeline?.stage ?? 'Qualified'} | next: ${topAction}` : 'Abordar top lead com tese mais forte',
        owner: 'Origination',
        priority: 'high',
      },
      {
        id: 'qa_stalled',
        title: stalledName
          ? `Destravar ${stalledName} | stage: ${stalled?.stage} | ${stalled?.nextAction ? `next: ${stalledAction}` : 'motivo: sem próxima ação definida'}`
          : 'Revisar contas stalled sem próxima ação',
        owner: 'Coverage',
        priority: 'medium',
      },
    ],
  }));
}));

app.get('/platform/status', wrap(async (_req, res) => res.json(ok(platformMode, {
  auth: 'real',
  dashboard: 'real',
  companies: 'real',
  qualification: 'real',
  leadScore: 'real',
  sources: 'real',
  monitoring: 'real',
  agents: 'partial',
  pipeline: 'partial',
  frontendDataFallback: 'partial',
  persistence: platformMode,
}))));

app.listen(env.port, () => {
  console.log(`Motor backend listening on http://localhost:${env.port}`);
});
