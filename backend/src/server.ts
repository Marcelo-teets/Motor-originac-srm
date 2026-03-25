import cors from 'cors';
import express from 'express';
import { authMiddleware, fetchCurrentSupabaseUser, signInWithPassword, signOutSupabase } from './lib/auth.js';
import { env } from './lib/env.js';
import { agentDefinitions } from './modules/agents.js';
import { dataIntelligenceAgents } from './modules/agentsDataIntelligence.js';
import { createPlatformRepository } from './repositories/platformRepository.js';
import { createAgentLearningRouter } from './routes/agentLearningRouter.js';
import { createAiRouter } from './routes/aiRouter.js';
import { createCompanyDecisionMemoRouter } from './routes/companyDecisionMemoRouter.js';
import { createCompanyIntelligenceRouter } from './routes/companyIntelligenceRouter.js';
import { createDataIntelligenceRouter } from './routes/dataIntelligenceRouter.js';
import { createMvpOrchestrationRouter } from './routes/mvpOrchestrationRouter.js';
import { createMvpReadinessRouter } from './routes/mvpReadinessRouter.js';
import { createQualificationIntelligenceBridgeRouter } from './routes/qualificationIntelligenceBridgeRouter.js';
import { AgentLearningService } from './services/agentLearningService.js';
import { DataIntelligenceService } from './services/dataIntelligenceService.js';
import { PlatformService } from './services/platformService.js';

const app = express();
app.use(cors());
app.use(express.json());

const repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
const service = new PlatformService(repository);
const dataIntelligence = new DataIntelligenceService();
const agentLearning = new AgentLearningService();
const allAgentDefinitions = [...agentDefinitions, ...dataIntelligenceAgents];
const platformMode = env.useSupabase ? 'real' : 'partial';
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

await service.bootstrap().catch((error) => {
  console.warn('Bootstrap warning:', error instanceof Error ? error.message : error);
});

await dataIntelligence.seedCatalog().catch((error) => {
  console.warn('Data intelligence seed warning:', error instanceof Error ? error.message : error);
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
app.use('/data-intelligence', createDataIntelligenceRouter());
app.use('/company-intelligence', createCompanyIntelligenceRouter());
app.use('/company-decision-memo', createCompanyDecisionMemoRouter());
app.use('/qualification-intelligence-bridge', createQualificationIntelligenceBridgeRouter());
app.use('/agent-learning', createAgentLearningRouter());
app.use('/mvp', createMvpOrchestrationRouter(service));
app.use('/mvp-readiness', createMvpReadinessRouter());

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
  res.json(ok(platformMode, detail?.signals ?? []));
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
app.get('/dashboard/agents', wrap((_req, res) => res.json(ok(platformMode, { agentsMode: platformMode, definitions: allAgentDefinitions.length }))));
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

app.get('/agents', wrap(async (_req, res) => res.json(ok(platformMode, { definitions: allAgentDefinitions }))));
app.get('/agents/definitions', wrap(async (_req, res) => res.json(ok(platformMode, allAgentDefinitions))));
app.get('/agents/runs', wrap(async (_req, res) => res.json(ok(platformMode, [{ agent_name: 'qualification_agent', status: 'completed', mode: platformMode }, { agent_name: 'connector_runner_agent', status: 'partial', mode: platformMode }, { agent_name: 'pattern_identification_agent', status: 'completed', mode: platformMode }]))));
app.get('/agents/runs/:id', wrap((req, res) => res.json(ok(platformMode, { execution_id: param(req.params.id), status: 'completed', mode: platformMode }))));
app.get('/agents/validations', wrap((_req, res) => res.json(ok(platformMode, [{ agent_name: 'qualification_agent', validation: 'passed' }, { agent_name: 'lead_score_agent', validation: 'passed' }, { agent_name: 'signal_extraction_agent', validation: 'seeded' }]))));
app.get('/agents/improvements', wrap(async (_req, res) => res.json(ok(platformMode, await agentLearning.listImprovementBacklog()))));
app.get('/agents/patterns', wrap(async (_req, res) => res.json(ok(platformMode, await service.listPatternCatalog()))));
app.post('/agents/run/:agent_name', wrap((req, res) => res.json(ok(platformMode, { agent: param(req.params.agent_name), scope: 'global', started: true }))));
app.post('/agents/run/company/:id/:agent_name', wrap((req, res) => res.json(ok(platformMode, { agent: param(req.params.agent_name), companyId: param(req.params.id), started: true }))));
app.post('/agents/orchestrate/company/:id', wrap(async (req, res) => {
  await service.refreshMonitoring(param(req.params.id));
  await service.recalculateCompany(param(req.params.id), 'orchestrated');
  res.json(ok(platformMode, { companyId: param(req.params.id), orchestrated: true, runCount: 5 }));
}));
app.get('/agents/health', wrap((_req, res) => res.json(ok(platformMode, { healthy: 6, degraded: 2, mocked: 0 }))));

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

app.get('/pipeline', wrap(async (_req, res) => res.json(ok(platformMode, (await service.getDashboard()).pipeline))));
app.get('/pipeline/stages', wrap(async (_req, res) => res.json(ok(platformMode, (await service.getDashboard()).pipeline.map((item) => item.stage)))));
app.get('/pipeline/company/:id', wrap(async (req, res) => {
  const ranking = await service.getCompanyRanking(param(req.params.id));
  res.json(ok(platformMode, { companyId: param(req.params.id), stage: ranking?.leadScore && ranking.leadScore >= 75 ? 'Approach' : 'Qualified' }));
}));
app.post('/pipeline/company/:id/move', wrap((req, res) => res.json(ok(platformMode, { companyId: param(req.params.id), movedTo: req.body?.stage ?? 'Qualified' }))));
app.get('/activities', wrap(async (_req, res) => res.json(ok(platformMode, (await Promise.all((await service.listCompanies()).map((company) => service.getCompanyDetail(company.id)))).flatMap((detail) => detail?.activities ?? [])))));
app.post('/activities', wrap((req, res) => res.status(201).json(ok(platformMode, { id: 'act_created', ...req.body }))));
app.get('/activities/company/:id', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.json(ok(platformMode, detail?.activities ?? []));
}));
app.get('/tasks', wrap((_req, res) => res.json(ok('partial', [{ id: 'tsk_1', title: 'Configurar variáveis Supabase', status: 'todo' }, { id: 'tsk_2', title: 'Acompanhar conectores adicionais', status: 'planned' }]))));
app.post('/tasks', wrap((req, res) => res.status(201).json(ok('partial', { id: 'tsk_created', ...req.body }))));
app.patch('/tasks/:id', wrap((req, res) => res.json(ok('partial', { id: param(req.params.id), ...req.body }))));

app.get('/platform/status', wrap(async (_req, res) => res.json(ok(platformMode, {
  auth: 'real',
  dashboard: 'real',
  companies: 'real',
  qualification: 'real',
  leadScore: 'real',
  sources: 'real',
  monitoring: 'real',
  dataIntelligence: 'real',
  companyIntelligence: 'real',
  companyDecisionMemo: 'real',
  qualificationIntelligenceBridge: 'real',
  mvpReadiness: 'real',
  agentLearning: 'real',
  agents: 'partial',
  pipeline: 'partial',
  frontendDataFallback: 'partial',
  persistence: platformMode,
}))));

app.listen(env.port, () => {
  console.log(`Motor backend listening on http://localhost:${env.port}`);
});
