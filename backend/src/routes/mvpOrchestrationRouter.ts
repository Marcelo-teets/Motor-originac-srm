import { Router } from 'express';
import { DataIntelligenceService } from '../services/dataIntelligenceService.js';
import { ConnectorRunnerService } from '../services/connectorRunnerService.js';
import { AgentLearningService } from '../services/agentLearningService.js';
import type { PlatformService } from '../services/platformService.js';

export const createMvpOrchestrationRouter = (platformService: PlatformService) => {
  const router = Router();
  const dataService = new DataIntelligenceService();
  const connectorRunner = new ConnectorRunnerService();
  const learningService = new AgentLearningService();

  router.post('/bootstrap', async (_req, res, next) => {
    try {
      const catalog = await dataService.seedCatalog();
      const bootstrapRuns = await connectorRunner.runCatalogBootstrap();
      res.json({ status: 'real', data: { catalog, bootstrapRuns } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/company/:id/refresh', async (req, res, next) => {
    try {
      const companyId = String(req.params.id);
      const connectorRuns = await connectorRunner.runCatalogBootstrap(companyId);
      const qualification = await platformService.recalculateCompany(companyId, 'mvp_refresh');
      await learningService.learnFromExecution({
        agentName: 'connector_runner_agent',
        companyId,
        success: true,
        note: 'MVP refresh executado com conectores e recálculo da companhia.',
        payload: { connectorRuns: connectorRuns.length },
      });
      res.json({ status: 'real', data: { companyId, connectorRuns, qualification } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/company/:id/feedback', async (req, res, next) => {
    try {
      const companyId = String(req.params.id);
      const feedback = await learningService.recordFeedback({
        agentName: String(req.body?.agentName ?? 'qualification_agent'),
        companyId,
        feedbackType: String(req.body?.feedbackType ?? 'manual_review'),
        score: typeof req.body?.score === 'number' ? req.body.score : undefined,
        note: req.body?.note ? String(req.body.note) : undefined,
        payload: typeof req.body?.payload === 'object' && req.body?.payload ? req.body.payload : undefined,
      });
      res.status(201).json({ status: 'real', data: feedback });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
