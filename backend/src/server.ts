import cors from 'cors';
import express from 'express';
import { activities, agentPayload, companies, companyDetails, dashboardSummary, pipeline, searchProfiles, sources, statusMatrix, tasks } from './data/mockData';

const app = express();
app.use(cors());
app.use(express.json());

const ok = (status: 'real' | 'partial' | 'mock', data: unknown) => ({ status, generatedAt: new Date().toISOString(), data });

app.get('/health', (_req, res) => res.json(ok('real', { service: 'backend', uptime: process.uptime() })));

app.post('/auth/login', (req, res) => res.json(ok('mock', { token: 'demo-token', user: { id: 'user_demo', email: req.body.email ?? 'demo@motor.com', role: 'admin' } })));
app.post('/auth/logout', (_req, res) => res.json(ok('mock', { success: true })));
app.get('/auth/me', (_req, res) => res.json(ok('mock', { id: 'user_demo', email: 'demo@motor.com', role: 'admin' })));

app.get('/search-profiles', (_req, res) => res.json(ok('real', searchProfiles)));
app.post('/search-profiles', (req, res) => res.status(201).json(ok('partial', { ...req.body, id: 'sp_created' })));
app.get('/search-profiles/:id', (req, res) => res.json(ok('real', searchProfiles.find((item) => item.id === req.params.id) ?? searchProfiles[0])));
app.patch('/search-profiles/:id', (req, res) => res.json(ok('partial', { id: req.params.id, ...req.body })));
app.delete('/search-profiles/:id', (req, res) => res.json(ok('partial', { id: req.params.id, deleted: true })));
app.post('/search-profiles/:id/run', (req, res) => res.json(ok('partial', { id: req.params.id, runId: 'spr_001', filters: req.body ?? null, matchedCompanies: companies.length })));

app.get('/companies', (_req, res) => res.json(ok('real', companies)));
app.get('/companies/:id', (req, res) => res.json(ok('real', companyDetails[req.params.id] ?? companyDetails[companies[0].id])));
app.get('/companies/:id/sources', (req, res) => res.json(ok('partial', { companyId: req.params.id, sources })));
app.get('/companies/:id/signals', (req, res) => res.json(ok('partial', { companyId: req.params.id, signals: ['expansao_geografica', 'hiring_credit', 'receivables_velocity'] })));
app.get('/companies/:id/monitoring', (req, res) => res.json(ok('partial', { companyId: req.params.id, monitoring: companyDetails[req.params.id]?.monitoring ?? null })));
app.get('/companies/:id/scores', (req, res) => res.json(ok('real', companyDetails[req.params.id]?.scores ?? null)));
app.get('/companies/:id/lead-score', (req, res) => res.json(ok('real', companyDetails[req.params.id]?.scores ?? null)));
app.get('/companies/:id/qualification', (req, res) => res.json(ok('real', companyDetails[req.params.id]?.qualification ?? null)));
app.get('/companies/:id/qualification/history', (req, res) => res.json(ok('partial', [{ companyId: req.params.id, score: 71, createdAt: '2026-02-21T00:00:00Z' }, { companyId: req.params.id, score: companyDetails[req.params.id]?.scores.qualification ?? 0, createdAt: '2026-03-21T00:00:00Z' }])));
app.post('/companies/:id/qualification/recalculate', (req, res) => res.json(ok('real', { companyId: req.params.id, action: 'recalculated', reason: req.body?.reason ?? 'manual' })));
app.get('/companies/:id/thesis', (req, res) => res.json(ok('real', companyDetails[req.params.id]?.thesis ?? null)));
app.get('/companies/:id/market-map', (req, res) => res.json(ok('partial', { companyId: req.params.id, peers: ['Peer Capital', 'Receivables X', 'Growth Lending Co.'] })));
app.get('/companies/:id/ranking', (req, res) => res.json(ok('real', { companyId: req.params.id, ranking: companies.findIndex((item) => item.id === req.params.id) + 1 })));
app.get('/companies/:id/activities', (req, res) => res.json(ok('partial', activities.filter((item) => item.companyId === req.params.id))));

app.get('/dashboard/summary', (_req, res) => res.json(ok('real', dashboardSummary)));
app.get('/dashboard/top-leads', (_req, res) => res.json(ok('real', companies.slice(0, 5))));
app.get('/dashboard/agents', (_req, res) => res.json(ok('real', agentPayload.definitions)));
app.get('/dashboard/monitoring', (_req, res) => res.json(ok('partial', { activeSources: 4, outputs24h: 132, triggers24h: 17 })));
app.get('/dashboard/patterns', (_req, res) => res.json(ok('real', companyDetails[companies[0].id].patterns)));

app.get('/sources/catalog', (_req, res) => res.json(ok('partial', sources)));
app.get('/sources/active', (_req, res) => res.json(ok('partial', sources.filter((item) => item.health !== 'down'))));
app.get('/sources/health', (_req, res) => res.json(ok('partial', sources.map((item) => ({ id: item.id, health: item.health })) )));
app.get('/monitoring/state', (_req, res) => res.json(ok('partial', { cadence: 'daily', status: 'running', lastRunAt: '2026-03-21T09:30:00Z' })));
app.get('/monitoring/outputs', (_req, res) => res.json(ok('partial', [{ sourceId: 'src_google_news', items: 19 }, { sourceId: 'src_cvm_rss', items: 7 }])));
app.get('/monitoring/triggers', (_req, res) => res.json(ok('partial', [{ companyId: companies[0].id, trigger: 'expansion_announcement' }])));
app.post('/monitoring/run', (_req, res) => res.json(ok('partial', { started: true, scope: 'all' })));
app.post('/monitoring/run/company/:id', (req, res) => res.json(ok('partial', { started: true, companyId: req.params.id })));
app.post('/monitoring/run/source/:id', (req, res) => res.json(ok('partial', { started: true, sourceId: req.params.id })));

app.get('/agents', (_req, res) => res.json(ok('real', agentPayload)));
app.get('/agents/definitions', (_req, res) => res.json(ok('real', agentPayload.definitions)));
app.get('/agents/runs', (_req, res) => res.json(ok('real', agentPayload.runs)));
app.get('/agents/runs/:id', (req, res) => res.json(ok('real', agentPayload.runs.find((item) => item.id === req.params.id) ?? null)));
app.get('/agents/validations', (_req, res) => res.json(ok('partial', agentPayload.runs.map((run) => ({ execution_id: run.execution_id, validation: run.validation_result })))));
app.get('/agents/improvements', (_req, res) => res.json(ok('mock', [{ id: 'imp_1', title: 'Adicionar score de cobrança' }])));
app.get('/agents/patterns', (_req, res) => res.json(ok('real', companyDetails[companies[0].id].patterns)));
app.post('/agents/run/:agent_name', (req, res) => res.json(ok('partial', { agent: req.params.agent_name, scope: 'global', started: true })));
app.post('/agents/run/company/:id/:agent_name', (req, res) => res.json(ok('partial', { agent: req.params.agent_name, companyId: req.params.id, started: true })));
app.post('/agents/orchestrate/company/:id', (req, res) => res.json(ok('real', { companyId: req.params.id, orchestrated: true, runCount: 5 })));
app.get('/agents/health', (_req, res) => res.json(ok('real', { healthy: 9, degraded: 2, mocked: 2 })));

app.get('/score/company/:id/current', (req, res) => res.json(ok('real', companyDetails[req.params.id]?.scores ?? null)));
app.get('/score/company/:id/history', (req, res) => res.json(ok('partial', [{ at: '2026-02-21', score: 70 }, { at: '2026-03-21', score: companyDetails[req.params.id]?.scores.qualification ?? 0 }])));
app.post('/score/company/:id/recalculate', (req, res) => res.json(ok('real', { companyId: req.params.id, recalculated: true })));
app.get('/lead-score/company/:id/current', (req, res) => res.json(ok('real', companyDetails[req.params.id]?.scores ?? null)));
app.get('/lead-score/company/:id/history', (req, res) => res.json(ok('partial', [{ at: '2026-02-21', score: 65 }, { at: '2026-03-21', score: companyDetails[req.params.id]?.scores.lead ?? 0 }])));
app.post('/lead-score/company/:id/recalculate', (req, res) => res.json(ok('real', { companyId: req.params.id, recalculated: true })));
app.get('/rankings/v2', (_req, res) => res.json(ok('real', companies.map((item, index) => ({ position: index + 1, ...item })))));
app.get('/rankings/v2/company/:id', (req, res) => res.json(ok('real', { companyId: req.params.id, position: companies.findIndex((item) => item.id === req.params.id) + 1 })));
app.post('/rankings/v2/recalculate', (_req, res) => res.json(ok('real', { recalculated: true, companies: companies.length })));

app.post('/thesis/company/:id/generate', (req, res) => res.json(ok('real', { companyId: req.params.id, generated: true })));
app.get('/thesis/company/:id', (req, res) => res.json(ok('real', companyDetails[req.params.id]?.thesis ?? null)));
app.post('/market-map/company/:id/generate', (req, res) => res.json(ok('partial', { companyId: req.params.id, generated: true })));
app.get('/market-map/company/:id', (req, res) => res.json(ok('partial', { companyId: req.params.id, peers: ['Receivables Alpha', 'Credit Beta'] })));

app.get('/pipeline', (_req, res) => res.json(ok('partial', pipeline)));
app.get('/pipeline/stages', (_req, res) => res.json(ok('partial', pipeline.map((item) => item.stage))));
app.get('/pipeline/company/:id', (req, res) => res.json(ok('partial', { companyId: req.params.id, stage: 'Qualified' })));
app.post('/pipeline/company/:id/move', (req, res) => res.json(ok('partial', { companyId: req.params.id, movedTo: req.body?.stage ?? 'Qualified' })));
app.get('/activities', (_req, res) => res.json(ok('partial', activities)));
app.post('/activities', (req, res) => res.status(201).json(ok('partial', { id: 'act_created', ...req.body })));
app.get('/activities/company/:id', (req, res) => res.json(ok('partial', activities.filter((item) => item.companyId === req.params.id))));
app.get('/tasks', (_req, res) => res.json(ok('partial', tasks)));
app.post('/tasks', (req, res) => res.status(201).json(ok('partial', { id: 'tsk_created', ...req.body })));
app.patch('/tasks/:id', (req, res) => res.json(ok('partial', { id: req.params.id, ...req.body })));

app.get('/platform/status', (_req, res) => res.json(ok('real', statusMatrix)));

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Motor backend listening on http://localhost:${port}`);
});
