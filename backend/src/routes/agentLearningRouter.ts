import { Router } from 'express';
import { AgentLearningService } from '../services/agentLearningService.js';

export const createAgentLearningRouter = () => {
  const router = Router();
  const service = new AgentLearningService();

  router.get('/memory', async (req, res, next) => {
    try {
      const agentName = req.query?.agentName ? String(req.query.agentName) : undefined;
      res.json({ status: 'real', data: await service.listRecentMemory(agentName) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/improvements', async (_req, res, next) => {
    try {
      res.json({ status: 'real', data: await service.listImprovementBacklog() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/memory', async (req, res, next) => {
    try {
      res.status(201).json({ status: 'real', data: await service.recordMemory({
        agentName: String(req.body?.agentName ?? ''),
        memoryType: String(req.body?.memoryType ?? ''),
        companyId: req.body?.companyId ? String(req.body.companyId) : undefined,
        sourceRef: req.body?.sourceRef ? String(req.body.sourceRef) : undefined,
        importance: typeof req.body?.importance === 'number' ? req.body.importance : undefined,
        payload: typeof req.body?.payload === 'object' && req.body?.payload ? req.body.payload : undefined,
      }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/feedback', async (req, res, next) => {
    try {
      res.status(201).json({ status: 'real', data: await service.recordFeedback({
        agentName: String(req.body?.agentName ?? ''),
        companyId: req.body?.companyId ? String(req.body.companyId) : undefined,
        feedbackType: String(req.body?.feedbackType ?? ''),
        score: typeof req.body?.score === 'number' ? req.body.score : undefined,
        note: req.body?.note ? String(req.body.note) : undefined,
        payload: typeof req.body?.payload === 'object' && req.body?.payload ? req.body.payload : undefined,
      }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/improvements', async (req, res, next) => {
    try {
      res.status(201).json({ status: 'real', data: await service.createImprovement({
        agentName: String(req.body?.agentName ?? ''),
        improvementTitle: String(req.body?.improvementTitle ?? ''),
        priority: req.body?.priority === 'high' || req.body?.priority === 'low' ? req.body.priority : 'medium',
        rationale: req.body?.rationale ? String(req.body.rationale) : undefined,
        payload: typeof req.body?.payload === 'object' && req.body?.payload ? req.body.payload : undefined,
      }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/learn', async (req, res, next) => {
    try {
      res.json({ status: 'real', data: await service.learnFromExecution({
        agentName: String(req.body?.agentName ?? ''),
        companyId: req.body?.companyId ? String(req.body.companyId) : undefined,
        success: Boolean(req.body?.success),
        note: String(req.body?.note ?? ''),
        payload: typeof req.body?.payload === 'object' && req.body?.payload ? req.body.payload : undefined,
      }) });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
