import cors from 'cors';
import express from 'express';
import { env } from './lib/env.js';
import { createPlatformRepository } from './repositories/platformRepository.js';
import { PlatformService } from './services/platformService.js';

const app = express();
app.use(cors());
app.use(express.json());

const repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
const service = new PlatformService(repository);
const platformMode = env.useSupabase ? 'real' : 'partial';
const ok = (status: 'real' | 'partial' | 'mock', data: unknown) => ({ status, generatedAt: new Date().toISOString(), data });

await service.bootstrap().catch((error) => {
  console.warn('Bootstrap warning:', error instanceof Error ? error.message : error);
});

app.get('/health', (_req, res) => res.json(ok('real', { service: 'backend', mode: platformMode, uptime: process.uptime() })));

app.post('/auth/login', (req, res) => res.json(ok('mock', { token: 'demo-token', user: { id: 'user_demo', email: req.body.email ?? 'demo@motor.com', role: 'admin' } })));
app.post('/auth/logout', (_req, res) => res.json(ok('mock', { success: true })));
app.get('/auth/me', (_req, res) => res.json(ok('mock', { id: 'user_demo', email: 'demo@motor.com', role: 'admin' })));

app.get('/search-profiles', async (_req, res) => res.json(ok(platformMode, await service.listSearchProfiles())));
app.get('/companies', async (_req, res) => res.json(ok('real', await service.listCompanies())));
app.get('/companies/:id', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.status(detail ? 200 : 404).json(ok(detail ? 'real' : 'partial', detail));
});
app.get('/companies/:id/sources', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', { companyId: req.params.id, sources: detail?.sources ?? [] }));
});
app.get('/companies/:id/signals', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', { companyId: req.params.id, signals: detail?.signals ?? [] }));
});
app.get('/companies/:id/monitoring', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('partial', { companyId: req.params.id, monitoring: detail?.monitoring ?? null, outputs: detail?.monitoringOutputs ?? [] }));
});
app.get('/companies/:id/scores', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', detail?.scores ?? null));
});
app.get('/companies/:id/lead-score', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', detail?.scores ?? null));
});
app.get('/companies/:id/qualification', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', detail?.qualification ?? null));
});
app.get('/companies/:id/qualification/history', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', detail?.scoreHistory ?? []));
});
app.post('/companies/:id/qualification/recalculate', async (req, res) => res.json(ok('real', { companyId: req.params.id, action: 'recalculated', reason: req.body?.reason ?? 'manual' })));
app.get('/companies/:id/thesis', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', detail?.thesis ?? null));
});
app.get('/companies/:id/market-map', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', { companyId: req.params.id, peers: detail?.marketMap ?? [] }));
});
app.get('/companies/:id/ranking', async (req, res) => res.json(ok('real', await service.getCompanyRanking(req.params.id))));
app.get('/companies/:id/activities', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('partial', detail?.activities ?? []));
});

app.get('/dashboard/summary', async (_req, res) => res.json(ok('real', await service.getDashboard())));
app.get('/dashboard/top-leads', async (_req, res) => res.json(ok('real', (await service.getDashboard()).topLeads)));
app.get('/dashboard/agents', (_req, res) => res.json(ok('real', { agentsMode: platformMode })));
app.get('/dashboard/monitoring', async (_req, res) => res.json(ok('partial', (await service.getDashboard()).monitoring)));
app.get('/dashboard/patterns', async (_req, res) => res.json(ok('real', (await service.getDashboard()).patterns)));

app.get('/sources/catalog', async (_req, res) => res.json(ok('real', await service.listSources())));
app.get('/sources/active', async (_req, res) => res.json(ok('real', (await service.listSources()).filter((item) => item.health !== 'down'))));
app.get('/sources/health', async (_req, res) => res.json(ok('partial', (await service.listSources()).map((item) => ({ id: item.id, health: item.health, status: item.status })))));
app.get('/monitoring/state', async (_req, res) => res.json(ok('partial', { cadence: 'daily + manual', status: 'running', mode: platformMode, lastRunAt: new Date().toISOString() })));
app.get('/monitoring/outputs', async (_req, res) => res.json(ok('partial', await service.listMonitoringOutputsAll())));
app.get('/monitoring/triggers', async (_req, res) => {
  const companies = await service.listCompanies();
  res.json(ok('partial', companies.map((item) => ({ companyId: item.id, triggerStrength: item.triggerStrength, topPatterns: item.topPatterns }))));
});
app.post('/monitoring/run', (_req, res) => res.json(ok('partial', { started: true, scope: 'all', mode: platformMode })));
app.post('/monitoring/run/company/:id', (req, res) => res.json(ok('partial', { started: true, companyId: req.params.id, mode: platformMode })));
app.post('/monitoring/run/source/:id', (req, res) => res.json(ok('partial', { started: true, sourceId: req.params.id, mode: platformMode })));

app.get('/agents', async (_req, res) => res.json(ok('real', { definitions: (await import('./modules/agents.js')).agentDefinitions })));
app.get('/agents/definitions', async (_req, res) => res.json(ok('real', (await import('./modules/agents.js')).agentDefinitions)));
app.get('/agents/runs', async (_req, res) => res.json(ok('partial', [{ agent_name: 'qualification_agent', status: 'completed', mode: platformMode }, { agent_name: 'pattern_identification_agent', status: 'completed', mode: platformMode }] )));
app.get('/agents/runs/:id', (req, res) => res.json(ok('partial', { execution_id: req.params.id, status: 'completed', mode: platformMode })));
app.get('/agents/validations', (_req, res) => res.json(ok('partial', [{ agent_name: 'qualification_agent', validation: 'passed' }, { agent_name: 'lead_score_agent', validation: 'passed' }] )));
app.get('/agents/improvements', (_req, res) => res.json(ok('mock', [{ id: 'imp_1', title: 'Adicionar conector Bacen após credenciais' }])));
app.get('/agents/patterns', async (_req, res) => res.json(ok('real', await service.listPatternCatalog())));
app.post('/agents/run/:agent_name', (req, res) => res.json(ok('partial', { agent: req.params.agent_name, scope: 'global', started: true })));
app.post('/agents/run/company/:id/:agent_name', (req, res) => res.json(ok('partial', { agent: req.params.agent_name, companyId: req.params.id, started: true })));
app.post('/agents/orchestrate/company/:id', (req, res) => res.json(ok('real', { companyId: req.params.id, orchestrated: true, runCount: 5 })));
app.get('/agents/health', (_req, res) => res.json(ok('real', { healthy: 4, degraded: 4, mocked: 2 })));

app.get('/score/company/:id/current', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', detail?.scores ?? null));
});
app.get('/score/company/:id/history', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', detail?.scoreHistory ?? []));
});
app.post('/score/company/:id/recalculate', (req, res) => res.json(ok('real', { companyId: req.params.id, recalculated: true, reason: req.body?.reason ?? 'manual' })));
app.get('/lead-score/company/:id/current', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', detail?.scores ?? null));
});
app.get('/lead-score/company/:id/history', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', detail?.scoreHistory ?? []));
});
app.post('/lead-score/company/:id/recalculate', (req, res) => res.json(ok('real', { companyId: req.params.id, recalculated: true })));
app.get('/rankings/v2', async (_req, res) => res.json(ok('real', await service.getRankings())));
app.get('/rankings/v2/company/:id', async (req, res) => res.json(ok('real', await service.getCompanyRanking(req.params.id))));
app.post('/rankings/v2/recalculate', async (_req, res) => res.json(ok('real', { recalculated: true, companies: (await service.listCompanies()).length })));

app.post('/thesis/company/:id/generate', (req, res) => res.json(ok('real', { companyId: req.params.id, generated: true, reason: req.body?.reason ?? 'manual' })));
app.get('/thesis/company/:id', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', detail?.thesis ?? null));
});
app.post('/market-map/company/:id/generate', (req, res) => res.json(ok('real', { companyId: req.params.id, generated: true, mode: platformMode })));
app.get('/market-map/company/:id', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('real', { companyId: req.params.id, peers: detail?.marketMap ?? [] }));
});

app.get('/pipeline', async (_req, res) => res.json(ok('partial', (await service.getDashboard()).pipeline)));
app.get('/pipeline/stages', async (_req, res) => res.json(ok('partial', (await service.getDashboard()).pipeline.map((item) => item.stage))));
app.get('/pipeline/company/:id', async (req, res) => {
  const ranking = await service.getCompanyRanking(req.params.id);
  res.json(ok('partial', { companyId: req.params.id, stage: ranking?.leadScore && ranking.leadScore >= 75 ? 'Approach' : 'Qualified' }));
});
app.post('/pipeline/company/:id/move', (req, res) => res.json(ok('partial', { companyId: req.params.id, movedTo: req.body?.stage ?? 'Qualified' })));
app.get('/activities', async (_req, res) => res.json(ok('partial', (await Promise.all((await service.listCompanies()).map((company) => service.getCompanyDetail(company.id)))).flatMap((detail) => detail?.activities ?? []))));
app.post('/activities', (req, res) => res.status(201).json(ok('partial', { id: 'act_created', ...req.body })));
app.get('/activities/company/:id', async (req, res) => {
  const detail = await service.getCompanyDetail(req.params.id);
  res.json(ok('partial', detail?.activities ?? []));
});
app.get('/tasks', (_req, res) => res.json(ok('partial', [{ id: 'tsk_1', title: 'Configurar variáveis Supabase', status: 'todo' }, { id: 'tsk_2', title: 'Adicionar Bacen connector', status: 'planned' }] )));
app.post('/tasks', (req, res) => res.status(201).json(ok('partial', { id: 'tsk_created', ...req.body })));
app.patch('/tasks/:id', (req, res) => res.json(ok('partial', { id: req.params.id, ...req.body })));

app.get('/platform/status', async (_req, res) => res.json(ok('real', {
  auth: 'mock',
  dashboard: 'real',
  companies: 'real',
  qualification: 'real',
  leadScore: 'real',
  sources: 'real',
  monitoring: 'partial',
  agents: 'real',
  pipeline: 'partial',
  frontendDataFallback: 'mock',
  persistence: platformMode,
})));

app.listen(env.port, () => {
  console.log(`Motor backend listening on http://localhost:${env.port}`);
});
