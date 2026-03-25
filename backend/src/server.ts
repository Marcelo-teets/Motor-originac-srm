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
import { createMvpQuickActionsRouter } from './routes/mvpQuickActionsRouter.js';
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
app.use('/mvp-quick-actions', createMvpQuickActionsRouter());

app.get('/auth/me', wrap(async (req, res) => {
  const liveUser = req.accessToken ? await fetchCurrentSupabaseUser(req.accessToken).catch(() => req.authUser!) : req.authUser;
  res.json(ok('real', liveUser));
}));
app.post('/auth/logout', wrap(async (req, res) => {
  if (req.accessToken) await signOutSupabase(req.accessToken);
  res.json(ok('real', { success: true }));
}));

app.get('/dashboard/summary', wrap(async (_req, res) => res.json(ok(platformMode, await service.getDashboard()))));
app.get('/companies', wrap(async (_req, res) => res.json(ok(platformMode, await service.listCompanies()))));
app.get('/companies/:id', wrap(async (req, res) => {
  const detail = await service.getCompanyDetail(param(req.params.id));
  res.status(detail ? 200 : 404).json(detail ? ok(platformMode, detail) : fail(404, 'Company not found'));
}));
app.post('/companies/:id/qualification/recalculate', wrap(async (req, res) => res.json(ok(platformMode, await service.recalculateCompany(param(req.params.id), req.body?.reason ?? 'manual')))));
app.get('/rankings/v2', wrap(async (_req, res) => res.json(ok(platformMode, await service.getRankings()))));
app.get('/pipeline', wrap(async (_req, res) => res.json(ok(platformMode, (await service.getDashboard()).pipeline))));
app.get('/activities', wrap(async (_req, res) => res.json(ok(platformMode, (await Promise.all((await service.listCompanies()).map((company) => service.getCompanyDetail(company.id)))).flatMap((detail) => detail?.activities ?? [])))));
app.get('/tasks', wrap((_req, res) => res.json(ok('partial', [{ id: 'tsk_1', title: 'Configurar variáveis Supabase', status: 'todo' }, { id: 'tsk_2', title: 'Acompanhar conectores adicionais', status: 'planned' }]))));
app.get('/agents', wrap(async (_req, res) => res.json(ok(platformMode, { definitions: allAgentDefinitions }))));
app.get('/platform/status', wrap(async (_req, res) => res.json(ok(platformMode, {
  auth: 'real', dashboard: 'real', companies: 'real', qualification: 'real', leadScore: 'real', sources: 'real', monitoring: 'real', dataIntelligence: 'real', companyIntelligence: 'real', companyDecisionMemo: 'real', qualificationIntelligenceBridge: 'real', mvpReadiness: 'real', mvpQuickActions: 'partial', agentLearning: 'real', agents: 'partial', pipeline: 'partial', frontendDataFallback: 'partial', persistence: platformMode,
}))));

app.listen(env.port, () => {
  console.log(`Motor backend listening on http://localhost:${env.port}`);
});
