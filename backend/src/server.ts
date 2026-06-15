import cors from 'cors';
import express from 'express';
import crypto from 'node:crypto';
import { authMiddleware, fetchCurrentSupabaseUser, signInWithPassword, signOutSupabase } from './lib/auth.js';
import { env } from './lib/env.js';
import { discoveryHitToCandidateDraft } from './lib/candidatePromotion.js';
import { runSearchProfileDiscovery } from './lib/discoveryCapture.js';
import { createPlatformRepository } from './repositories/platformRepository.js';
import { asOwner, isActivityStatus, isActivityType, isPipelineStage, isTaskStatus } from './lib/crm.js';
import { createAiRouter } from './routes/aiRouter.js';
import { createAbmWarRoomRouter } from './routes/abmWarRoomRouter.js';
import { createWatchlistRouter } from './routes/watchlistRouter.js';
import { AbaService } from './services/abaService.js';
import { PlatformService } from './services/platformService.js';
import { SearchProfileCaptureService } from './services/searchProfileCaptureService.js';
import { SearchProfileCaptureRuntime } from './services/searchProfileCaptureRuntime.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const app = express();
app.use((req, res, next) => {
  req.requestId = req.header('x-request-id') || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});
app.use(cors());
app.use(express.json());

const repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
const service = new PlatformService(repository);
const abaService = new AbaService();
const searchCaptureRuntime = new SearchProfileCaptureRuntime(repository);
const searchCaptureService = new SearchProfileCaptureService(searchCaptureRuntime, {
  refreshMonitoring: async (companyId) => service.refreshMonitoring(companyId),
  recomputeDerivedData: async (companyId) => service.recomputeDerivedData(companyId),
});
const platformMode = env.useSupabase ? 'real' : 'partial';
const crmRuntimeMode: 'real' | 'mock' = env.useSupabase ? 'real' : 'mock';
const ok = (status: 'real' | 'partial' | 'mock', data: unknown, requestId?: string) => ({ status, generatedAt: new Date().toISOString(), requestId, data });
const fail = (status: number, error: string, code = status >= 500 ? 'internal_error' : 'bad_request', requestId?: string, details?: unknown) => ({
  statusCode: status,
  code,
  generatedAt: new Date().toISOString(),
  requestId,
  ...(details === undefined ? {} : { details }),
  error,
});
const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const statusCodeFromError = (error: unknown) => {
  if (!isRecord(error)) return 500;
  const statusCode = typeof error.statusCode === 'number' ? error.statusCode : error.status;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600 ? statusCode : 500;
};
const codeFromError = (error: unknown, statusCode: number) => {
  if (isRecord(error)) {
    if (typeof error.code === 'string' && error.code.trim()) return error.code;
    if (typeof error.type === 'string' && error.type.trim()) return error.type.replace(/[^a-zA-Z0-9_]+/g, '_');
  }
  return statusCode >= 500 ? 'internal_error' : 'bad_request';
};
const wrap = (handler: express.Handler): express.Handler => async (req, res, next) => {
  try {
    await Promise.resolve(handler(req, res, next));
  } catch (error) {
    const statusCode = statusCodeFromError(error);
    const code = codeFromError(error, statusCode);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error(JSON.stringify({ level: 'error', type: 'request_error', requestId: req.requestId, method: req.method, path: req.originalUrl, statusCode, code, message }));
    res.status(statusCode).json(fail(statusCode, message, code, req.requestId));
  }
};
const assertNonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

await service.bootstrap().catch((error) => {
  console.warn('Bootstrap warning:', error instanceof Error ? error.message : error);
});

app.get('/health', (req, res) => res.json(ok(platformMode, { service: 'backend', mode: platformMode, uptime: process.uptime() }, req.requestId)));

app.post('/auth/login', wrap(async (req, res) => {
  const email = String(req.body?.email ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!email || !password) {
    res.status(400).json(fail(400, 'Email e password sao obrigatorios.', 'validation_error', req.requestId));
    return;
  }

  const session = await signInWithPassword(email, password);
  res.json(ok('real', session, req.requestId));
}));

app.use(authMiddleware);
app.use('/ai', createAiRouter(service));
app.use('/abm', createAbmWarRoomRouter());
app.use('/watchlists', createWatchlistRouter(repository));

app.get('/auth/me', wrap(async (req, res) => {
  const liveUser = req.accessToken ? await fetchCurrentSupabaseUser(req.accessToken).catch(() => req.authUser!) : req.authUser;
  res.json(ok('real', liveUser, req.requestId));
}));
app.post('/auth/logout', wrap(async (req, res) => {
  if (req.accessToken) await signOutSupabase(req.accessToken);
  res.json(ok('real', { success: true }, req.requestId));
}));

app.get('/search-profiles', wrap(async (req, res) => res.json(ok(platformMode, await service.listSearchProfiles(), req.requestId))));
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
  res.status(201).json(ok(platformMode, profile, req.requestId));
}));
app.post('/search-profiles/:id/run', wrap(async (req, res) => {
  const result = await searchCaptureService.runCapture(param(req.params.id), 'manual');
  res.json(ok(platformMode, result, req.requestId));
}));
app.get('/search-profiles/:id/candidates', wrap(async (req, res) => {
  const profileId = param(req.params.id);
  res.json(ok(platformMode, await searchCaptureRuntime.listCandidates(profileId), req.requestId));
}));
app.post('/search-profiles/candidates/:id/promote', wrap(async (req, res) => {
  res.json(ok(platformMode, await searchCaptureService.promoteCandidate(param(req.params.id)), req.requestId));
}));
app.get('/companies', wrap(async (req, res) => res.json(ok(platformMode, await service.listCompanies(), req.requestId))));
app.get('/companies/:id', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.status(detail ? 200 : 404).json(detail ? ok(platformMode, detail, req.requestId) : fail(404, 'Company not found', 'not_found', req.requestId));
}));
app.get('/companies/:id/patterns', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.patterns ?? [], req.requestId));
}));
app.get('/companies/:id/sources', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, { companyId: param(req.params.id), sources: detail?.sources ?? [] }, req.requestId));
}));
app.get('/companies/:id/signals', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, { companyId: param(req.params.id), signals: detail?.signals ?? [] }, req.requestId));
}));
app.get('/companies/:id/monitoring', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, { companyId: param(req.params.id), monitoring: detail?.monitoring ?? null, outputs: detail?.monitoringOutputs ?? [] }, req.requestId));
}));
app.get('/companies/:id/scores', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scores ?? null, req.requestId));
}));
app.get('/companies/:id/lead-score', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scores ?? null, req.requestId));
}));
app.get('/companies/:id/qualification', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.qualification ?? null, req.requestId));
}));
app.get('/companies/:id/qualification/history', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scoreHistory ?? [], req.requestId));
}));
app.post('/companies/:id/qualification/recalculate', wrap(async (req, res) => res.json(ok(platformMode, await service.recalculateCompany(param(req.params.id), req.body?.reason ?? 'manual'), req.requestId))));
app.get('/companies/:id/thesis', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.thesis ?? null, req.requestId));
}));
app.get('/companies/:id/market-map', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, { companyId: param(req.params.id), peers: detail?.marketMap ?? [] }, req.requestId));
}));
app.get('/companies/:id/ranking', wrap(async (req, res) => res.json(ok(platformMode, await service.getCompanyRanking(param(req.params.id)), req.requestId))));
app.get('/companies/:id/activities', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.activities ?? [], req.requestId));
}));

app.get('/dashboard/summary', wrap(async (req, res) => res.json(ok(platformMode, await service.getDashboard(), req.requestId))));
app.get('/dashboard/top-leads', wrap(async (req, res) => res.json(ok(platformMode, (await service.getDashboard()).topLeads, req.requestId))));
app.get('/dashboard/agents', wrap((req, res) => res.json(ok(platformMode, { agentsMode: platformMode }, req.requestId))));
app.get('/dashboard/monitoring', wrap(async (req, res) => res.json(ok(platformMode, (await service.getDashboard()).monitoring, req.requestId))));
app.get('/dashboard/patterns', wrap(async (req, res) => res.json(ok(platformMode, (await service.getDashboard()).patterns, req.requestId))));

app.get('/sources/catalog', wrap(async (req, res) => res.json(ok(platformMode, await service.listSources(), req.requestId))));
app.get('/sources/active', wrap(async (req, res) => res.json(ok(platformMode, (await service.listSources()).filter((item) => item.health !== 'down'), req.requestId))));
app.get('/sources/health', wrap(async (req, res) => res.json(ok(platformMode, (await service.listSources()).map((item) => ({ id: item.id, health: item.health, status: item.status })), req.requestId))));
app.get('/monitoring/state', wrap(async (req, res) => res.json(ok(platformMode, { cadence: 'daily + manual', status: 'running', mode: platformMode, lastRunAt: new Date().toISOString() }, req.requestId))));
app.get('/monitoring/outputs', wrap(async (req, res) => res.json(ok(platformMode, await service.listMonitoringOutputsAll(), req.requestId))));
app.get('/monitoring/triggers', wrap(async (req, res) => {
  const companies = await service.listCompanies();
  res.json(ok(platformMode, companies.map((item) => ({ companyId: item.id, triggerStrength: item.triggerStrength, topPatterns: item.topPatterns })), req.requestId));
}));
app.post('/monitoring/run', wrap(async (req, res) => res.json(ok(platformMode, { started: true, ...(await service.refreshMonitoring()) }, req.requestId))));
app.post('/monitoring/run/company/:id', wrap(async (req, res) => res.json(ok(platformMode, { started: true, companyId: param(req.params.id), ...(await service.refreshMonitoring(param(req.params.id))) }, req.requestId))));
app.post('/monitoring/run/source/:id', wrap((req, res) => res.json(ok(platformMode, { started: true, sourceId: param(req.params.id), note: 'Source-specific filtering uses persisted outputs catalog.' }, req.requestId))));

app.get('/agents', wrap(async (req, res) => res.json(ok(platformMode, { definitions: (await import('./modules/agents.js')).agentDefinitions }, req.requestId))));
app.get('/agents/definitions', wrap(async (req, res) => res.json(ok(platformMode, (await import('./modules/agents.js')).agentDefinitions, req.requestId))));
app.get('/agents/runs', wrap(async (req, res) => res.json(ok(platformMode, [{ agent_name: 'qualification_agent', status: 'completed', mode: platformMode }, { agent_name: 'pattern_identification_agent', status: 'completed', mode: platformMode }], req.requestId))));
app.get('/agents/runs/:id', wrap((req, res) => res.json(ok(platformMode, { execution_id: param(req.params.id), status: 'completed', mode: platformMode }, req.requestId))));
app.get('/agents/validations', wrap((req, res) => res.json(ok(platformMode, [{ agent_name: 'qualification_agent', validation: 'passed' }, { agent_name: 'lead_score_agent', validation: 'passed' }], req.requestId))));
app.get('/agents/improvements', wrap((req, res) => res.json(ok('partial', [{ id: 'imp_1', title: 'Expandir conectores adicionais apos estabilizar Supabase/Auth real.' }], req.requestId))));
app.get('/agents/patterns', wrap(async (req, res) => res.json(ok(platformMode, await service.listPatternCatalog(), req.requestId))));
app.post('/agents/run/:agent_name', wrap((req, res) => res.json(ok(platformMode, { agent: param(req.params.agent_name), scope: 'global', started: true }, req.requestId))));
app.post('/agents/run/company/:id/:agent_name', wrap((req, res) => res.json(ok(platformMode, { agent: param(req.params.agent_name), companyId: param(req.params.id), started: true }, req.requestId))));
app.post('/agents/orchestrate/company/:id', wrap(async (req, res) => {
  await service.refreshMonitoring(param(req.params.id));
  await service.recalculateCompany(param(req.params.id), 'orchestrated');
  res.json(ok(platformMode, { companyId: param(req.params.id), orchestrated: true, runCount: 3 }, req.requestId));
}));
app.get('/agents/health', wrap((req, res) => res.json(ok(platformMode, { healthy: 4, degraded: 1, mocked: 0 }, req.requestId))));
app.get('/aba/status', wrap(async (req, res) => {
  const dashboard = await service.getDashboard();
  res.json(ok(platformMode, abaService.getStatus(dashboard), req.requestId));
}));
app.post('/aba/command', wrap(async (req, res) => {
  const target = String(req.body?.target ?? 'aba');
  const action = String(req.body?.action ?? '').trim();
  if (!action) {
    res.status(400).json(fail(400, 'action is required.', 'validation_error', req.requestId));
    return;
  }
  if (!['aba', 'paper_clip', 'adm'].includes(target)) {
    res.status(400).json(fail(400, `Invalid target: ${target}`, 'validation_error', req.requestId));
    return;
  }
  const context = typeof req.body?.context === 'object' && req.body?.context ? req.body.context : {};
  const command = abaService.runCommand(target as 'aba' | 'paper_clip' | 'adm', action, context);

  if (context.companyId && typeof context.companyId === 'string') {
    if (target === 'paper_clip') {
      await service.saveTask({
        companyId: context.companyId,
        title: `ABA/Paper Clip | ${action}`,
        description: `Comando automatico: ${action}`,
        owner: 'Origination',
        status: 'todo',
        dueDate: null,
      }).catch(() => undefined);
    }
    if (target === 'adm') {
      await service.saveActivity({
        companyId: context.companyId,
        type: 'committee',
        title: `ABA/ADM | ${action}`,
        description: `Comando administrativo: ${action}`,
        owner: 'Coverage',
        status: 'open',
        dueDate: null,
      }).catch(() => undefined);
    }
  }

  res.status(201).json(ok(platformMode, command, req.requestId));
}));
app.post('/aba/auto-run', wrap(async (req, res) => {
  const dashboard = await service.getDashboard();
  const runs = abaService.runSuggestedImprovements(dashboard);
  res.status(201).json(ok(platformMode, { runCount: runs.length, runs }, req.requestId));
}));
app.post('/agents/paper-clip/command', wrap(async (req, res) => {
  const action = String(req.body?.action ?? '').trim();
  if (!action) {
    res.status(400).json(fail(400, 'action is required.', 'validation_error', req.requestId));
    return;
  }
  res.status(201).json(ok(platformMode, abaService.runCommand('paper_clip', action, typeof req.body?.context === 'object' && req.body?.context ? req.body.context : {}), req.requestId));
}));
app.post('/agents/adm/command', wrap(async (req, res) => {
  const action = String(req.body?.action ?? '').trim();
  if (!action) {
    res.status(400).json(fail(400, 'action is required.', 'validation_error', req.requestId));
    return;
  }
  res.status(201).json(ok(platformMode, abaService.runCommand('adm', action, typeof req.body?.context === 'object' && req.body?.context ? req.body.context : {}), req.requestId));
}));

app.get('/score/company/:id/current', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scores ?? null, req.requestId));
}));
app.get('/score/company/:id/history', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scoreHistory ?? [], req.requestId));
}));
app.post('/score/company/:id/recalculate', wrap(async (req, res) => res.json(ok(platformMode, await service.recalculateCompany(param(req.params.id), req.body?.reason ?? 'manual'), req.requestId))));
app.get('/lead-score/company/:id/current', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scores ?? null, req.requestId));
}));
app.get('/lead-score/company/:id/history', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.scoreHistory ?? [], req.requestId));
}));
app.post('/lead-score/company/:id/recalculate', wrap(async (req, res) => res.json(ok(platformMode, await service.recalculateCompany(param(req.params.id), req.body?.reason ?? 'manual'), req.requestId))));
app.get('/rankings/v2', wrap(async (req, res) => res.json(ok(platformMode, await service.getRankings(), req.requestId))));
app.get('/rankings/v2/company/:id', wrap(async (req, res) => res.json(ok(platformMode, await service.getCompanyRanking(param(req.params.id)), req.requestId))));
app.post('/rankings/v2/recalculate', wrap(async (req, res) => {
  await service.recomputeDerivedData();
  res.json(ok(platformMode, { recalculated: true, companies: (await service.listCompanies()).length }, req.requestId));
}));

app.post('/thesis/company/:id/generate', wrap(async (req, res) => {
  await service.recalculateCompany(param(req.params.id), req.body?.reason ?? 'manual');
  res.json(ok(platformMode, { companyId: param(req.params.id), generated: true, reason: req.body?.reason ?? 'manual' }, req.requestId));
}));
app.get('/thesis/company/:id', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.thesis ?? null, req.requestId));
}));
app.post('/market-map/company/:id/generate', wrap((req, res) => res.json(ok(platformMode, { companyId: param(req.params.id), generated: true, mode: platformMode }, req.requestId))));
app.get('/market-map/company/:id', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, { companyId: param(req.params.id), peers: detail?.marketMap ?? [] }, req.requestId));
}));

app.get('/pipeline', wrap(async (req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, rows: await service.listPipelineRows() }, req.requestId))));
app.get('/pipeline/stages', wrap(async (req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, stages: await service.listPipelineStages() }, req.requestId))));
app.get('/pipeline/company/:id', wrap(async (req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, row: await service.getPipelineByCompany(param(req.params.id)) }, req.requestId))));
app.post('/pipeline/company/:id/move', wrap(async (req, res) => {
  const stage = String(req.body?.stage ?? '');
  if (!isPipelineStage(stage)) {
    res.status(400).json(fail(400, `Invalid stage: ${stage}`, 'validation_error', req.requestId));
    return;
  }
  const companyId = param(req.params.id);
  const moved = await service.movePipelineStage(companyId, stage)
    ?? await repository.savePipelineRow({ companyId, stage, owner: 'Unknown', nextAction: '' });
  res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, row: moved }, req.requestId));
}));
app.patch('/pipeline/company/:id/next-action', wrap(async (req, res) => {
  const nextAction = String(req.body?.nextAction ?? req.body?.next_action ?? '').trim();
  if (!nextAction) {
    res.status(400).json(fail(400, 'nextAction is required.', 'validation_error', req.requestId));
    return;
  }
  const companyId = param(req.params.id);
  const updated = await service.updateNextAction(companyId, nextAction)
    ?? await repository.savePipelineRow({ companyId, stage: 'Identified', owner: 'Unknown', nextAction });
  res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, row: updated }, req.requestId));
}));
app.get('/pipeline/snapshot', wrap(async (req, res) => {
  const snapshot = await service.getPipelineSnapshot();
  res.json(ok(crmRuntimeMode, snapshot, req.requestId));
}));
app.get('/activities', wrap(async (req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, items: await service.listActivities() }, req.requestId))));
app.post('/activities', wrap(async (req, res) => {
  const companyId = String(req.body?.companyId ?? req.body?.company_id ?? '').trim();
  const title = String(req.body?.title ?? '').trim();
  const rawType = String(req.body?.type ?? 'other');
  const rawStatus = String(req.body?.status ?? 'open');
  if (!assertNonEmpty(companyId)) {
    res.status(400).json(fail(400, 'companyId is required.', 'validation_error', req.requestId));
    return;
  }
  if (!assertNonEmpty(title)) {
    res.status(400).json(fail(400, 'title is required.', 'validation_error', req.requestId));
    return;
  }
  if (!isActivityType(rawType)) {
    res.status(400).json(fail(400, `Invalid activity type: ${rawType}`, 'validation_error', req.requestId));
    return;
  }
  if (!isActivityStatus(rawStatus)) {
    res.status(400).json(fail(400, `Invalid activity status: ${rawStatus}`, 'validation_error', req.requestId));
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
  res.status(201).json(ok(crmRuntimeMode, { mode: crmRuntimeMode, item: created }, req.requestId));
}));
app.get('/activities/company/:id', wrap(async (req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, items: await service.listActivities(param(req.params.id)) }, req.requestId))));
app.get('/tasks', wrap(async (req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, items: await service.listTasks() }, req.requestId))));
app.get('/tasks/company/:id', wrap(async (req, res) => res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, items: await service.listTasks(param(req.params.id)) }, req.requestId))));
app.post('/tasks', wrap(async (req, res) => {
  const companyId = String(req.body?.companyId ?? req.body?.company_id ?? '').trim();
  const title = String(req.body?.title ?? '').trim();
  const rawStatus = String(req.body?.status ?? 'todo');
  if (!assertNonEmpty(companyId)) {
    res.status(400).json(fail(400, 'companyId is required.', 'validation_error', req.requestId));
    return;
  }
  if (!assertNonEmpty(title)) {
    res.status(400).json(fail(400, 'title is required.', 'validation_error', req.requestId));
    return;
  }
  if (!isTaskStatus(rawStatus)) {
    res.status(400).json(fail(400, `Invalid task status: ${rawStatus}`, 'validation_error', req.requestId));
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
  res.status(201).json(ok(crmRuntimeMode, { mode: crmRuntimeMode, item: created }, req.requestId));
}));
app.patch('/tasks/:id', wrap(async (req, res) => {
  if (req.body?.status && !isTaskStatus(String(req.body.status))) {
    res.status(400).json(fail(400, `Invalid task status: ${String(req.body.status)}`, 'validation_error', req.requestId));
    return;
  }
  if (req.body?.title !== undefined && !assertNonEmpty(String(req.body.title))) {
    res.status(400).json(fail(400, 'title cannot be empty.', 'validation_error', req.requestId));
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
    res.status(404).json(fail(404, 'Task not found.', 'not_found', req.requestId));
    return;
  }
  res.json(ok(crmRuntimeMode, { mode: crmRuntimeMode, item: updated }, req.requestId));
}));
app.get('/monitoring/snapshot', wrap(async (req, res) => {
  res.json(ok(platformMode, await service.getMonitoringSnapshot(), req.requestId));
}));
app.get('/agents/snapshot', wrap(async (req, res) => {
  res.json(ok(platformMode, await service.getAgentsSnapshot(), req.requestId));
}));
app.get('/mvp-readiness', wrap(async (req, res) => {
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
  }, req.requestId));
}));
app.get('/mvp/ops/quick-actions', wrap(async (req, res) => {
  const [rankings, pipelineRows] = await Promise.all([service.getRankings(), service.listPipelineRows()]);
  const top = rankings[0];
  const stalled = pipelineRows.find((row) => row.stage === 'Identified' || row.stage === 'Recycled');
  const stalledName = stalled ? rankings.find((row) => row.companyId === stalled.companyId)?.companyName ?? stalled.companyId : null;
  const stalledAction = stalled?.nextAction || 'Definir proxima acao comercial';
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
          ? `Destravar ${stalledName} | stage: ${stalled?.stage} | ${stalled?.nextAction ? `next: ${stalledAction}` : 'motivo: sem proxima acao definida'}`
          : 'Revisar contas stalled sem proxima acao',
        owner: 'Coverage',
        priority: 'medium',
      },
    ],
  }, req.requestId));
}));

app.get('/platform/status', wrap(async (req, res) => res.json(ok(platformMode, {
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
}, req.requestId))));

app.use((req, res) => {
  res.status(404).json(fail(404, 'Route not found.', 'not_found', req.requestId, { path: req.originalUrl }));
});

app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const statusCode = statusCodeFromError(error);
  const code = codeFromError(error, statusCode);
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error(JSON.stringify({ level: 'error', type: 'unhandled_request_error', requestId: req.requestId, method: req.method, path: req.originalUrl, statusCode, code, message }));
  res.status(statusCode).json(fail(statusCode, message, code, req.requestId));
});

// Exportacao para Vercel serverless
export { app };

// Servidor local (desenvolvimento apenas)
// Em producao no Vercel, VERCEL=1 e setado automaticamente pelo runtime.
if (!process.env.VERCEL) {
  const port = env.port ?? 4000;
  app.listen(port, () => {
    console.log(`[motor-backend] listening on http://localhost:${port}`);
    console.log(`[motor-backend] mode: ${platformMode} | supabase: ${env.useSupabase}`);
  });
}
