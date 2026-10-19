import { Router } from 'express';
import type { CandidateDecisionQueueService } from '../services/candidateDecisionQueueService.js';
import { FidcAssignorHumanReviewService } from '../services/fidcAssignorHumanReviewService.js';

export const createCandidateDecisionQueueRouter = (service: CandidateDecisionQueueService) => {
  const router = Router();

  // Human triage audit is intentionally separate from company identity approval.
  // The SQL function checks the active god_mode reviewer and immutable CVM source.
  const humanReviews = new FidcAssignorHumanReviewService();

  router.get('/fidc-assignors/reviews', async (req, res, next) => {
    try {
      if (!req.authUser?.id) {
        res.status(401).json({ status: 'partial', error: 'Authentication required.' });
        return;
      }
      const data = await humanReviews.latest({ id: req.authUser.id });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ status: 'real', generatedAt: new Date().toISOString(), data });
    } catch (error) { next(error); }
  });

  router.get('/fidc-assignors/reviews/:cnpj', async (req, res, next) => {
    try {
      if (!req.authUser?.id) {
        res.status(401).json({ status: 'partial', error: 'Authentication required.' });
        return;
      }
      const cnpj = String(req.params.cnpj ?? '');
      const data = await humanReviews.history({ id: req.authUser.id }, cnpj);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ status: 'real', generatedAt: new Date().toISOString(), data });
    } catch (error) { next(error); }
  });

  router.post('/fidc-assignors/reviews', async (req, res, next) => {
    try {
      if (!req.authUser?.id) {
        res.status(401).json({ status: 'partial', error: 'Authentication required.' });
        return;
      }
      const data = await humanReviews.record(
        { id: req.authUser.id, email: req.authUser.email },
        req.body,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json({ status: 'real', generatedAt: new Date().toISOString(), data });
    } catch (error) { next(error); }
  });


  router.get('/fidc-assignors', async (_req, res, next) => {
    try {
      const data = await service.listFidcAssignors();
      res.json({ status: 'real', generatedAt: new Date().toISOString(), data });
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const data = await service.list({
        queue: req.query.queue as 'commercial' | 'market_map' | 'identity' | 'promoted' | 'reviewable' | 'all' | undefined,
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
