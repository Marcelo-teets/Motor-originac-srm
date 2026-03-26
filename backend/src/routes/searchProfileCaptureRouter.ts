import { Router } from 'express';

export type SearchProfileCaptureRouterHandlers = {
  listRuns: (searchProfileId?: string) => Promise<unknown>;
  listCandidates: (searchProfileId?: string) => Promise<unknown>;
  runCapture: (searchProfileId: string, triggerMode?: 'manual' | 'scheduled' | 'bootstrap') => Promise<unknown>;
  promoteCandidate: (candidateId: string) => Promise<unknown>;
};

export const createSearchProfileCaptureRouter = (handlers: SearchProfileCaptureRouterHandlers) => {
  const router = Router();

  router.get('/search-profile-runs', async (req, res, next) => {
    try {
      const searchProfileId = req.query?.searchProfileId ? String(req.query.searchProfileId) : undefined;
      res.json({ status: 'real', data: await handlers.listRuns(searchProfileId) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/discovered-candidates', async (req, res, next) => {
    try {
      const searchProfileId = req.query?.searchProfileId ? String(req.query.searchProfileId) : undefined;
      res.json({ status: 'real', data: await handlers.listCandidates(searchProfileId) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/search-profiles/:id/capture', async (req, res, next) => {
    try {
      const triggerMode = req.body?.triggerMode === 'scheduled' || req.body?.triggerMode === 'bootstrap'
        ? req.body.triggerMode
        : 'manual';

      res.json({
        status: 'real',
        data: await handlers.runCapture(String(req.params.id), triggerMode),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/discovered-candidates/:id/promote', async (req, res, next) => {
    try {
      res.json({
        status: 'real',
        data: await handlers.promoteCandidate(String(req.params.id)),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
