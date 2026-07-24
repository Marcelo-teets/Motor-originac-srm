import { Router } from 'express';
import type { CandidateDecisionQueueService } from '../services/candidateDecisionQueueService.js';

export const createCandidateDecisionQueueRouter = (service: CandidateDecisionQueueService) => {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const data = await service.list({
        queue: req.query.queue as 'commercial' | 'market_map' | 'identity' | 'promoted' | 'all' | undefined,
        priority: req.query.priority ? String(req.query.priority) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });
      res.json({ status: 'real', generatedAt: new Date().toISOString(), data });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
