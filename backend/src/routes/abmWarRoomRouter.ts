import { Router } from 'express';
import { AccountStakeholderService } from '../services/accountStakeholderService.js';
import { CommercialMomentumService } from '../services/commercialMomentumService.js';
import { CommercialPriorityService } from '../services/commercialPriorityService.js';
import { ObjectionIntelligenceService } from '../services/objectionIntelligenceService.js';
import { PreCallBriefingService } from '../services/preCallBriefingService.js';
import { TouchpointService } from '../services/touchpointService.js';

const ok = (data: unknown) => ({ status: 'real', generatedAt: new Date().toISOString(), data });

export const createAbmWarRoomRouter = () => {
  const router = Router();
  const stakeholderService = new AccountStakeholderService();
  const touchpointService = new TouchpointService();
  const objectionService = new ObjectionIntelligenceService();
  const momentumService = new CommercialMomentumService();
  const priorityService = new CommercialPriorityService();
  const briefingService = new PreCallBriefingService();

  router.get('/companies/:companyId/stakeholders', async (req, res) => {
    res.json(ok(await stakeholderService.listByCompany(req.params.companyId)));
  });

  router.post('/companies/:companyId/stakeholders', async (req, res) => {
    const created = await stakeholderService.create(req.params.companyId, req.body ?? {});
    res.status(201).json(ok(created));
  });

  router.get('/companies/:companyId/touchpoints', async (req, res) => {
    res.json(ok(await touchpointService.listByCompany(req.params.companyId)));
  });

  router.post('/companies/:companyId/touchpoints', async (req, res) => {
    const created = await touchpointService.create(req.params.companyId, req.body ?? {});
    res.status(201).json(ok(created));
  });

  router.get('/companies/:companyId/objections', async (req, res) => {
    res.json(ok(await objectionService.listByCompany(req.params.companyId)));
  });

  router.post('/companies/:companyId/objections', async (req, res) => {
    const created = await objectionService.create(req.params.companyId, req.body ?? {});
    res.status(201).json(ok(created));
  });

  router.get('/war-room/weekly', async (_req, res) => {
    res.json(ok(await briefingService.weeklyWarRoom()));
  });

  router.get('/companies/:companyId/pre-call-briefing', async (req, res) => {
    res.json(ok(await briefingService.build(req.params.companyId)));
  });

  router.get('/companies/:companyId/pre-mortem', async (req, res) => {
    res.json(ok(await briefingService.buildPreMortem(req.params.companyId)));
  });

  router.post('/companies/:companyId/recalculate-commercial-layer', async (req, res) => {
    const companyId = req.params.companyId;
    const [momentum, priority] = await Promise.all([
      momentumService.compute(companyId),
      priorityService.compute(companyId),
    ]);
    res.json(ok({ companyId, momentum, priority, reason: req.body?.reason ?? 'manual' }));
  });

  return router;
};
