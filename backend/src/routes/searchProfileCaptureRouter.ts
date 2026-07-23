import { Router } from 'express';

export type SearchProfileCaptureRouterHandlers = {
  listRuns: (searchProfileId?: string) => Promise<unknown>;
  listCandidates: (searchProfileId?: string) => Promise<unknown>;
  runCapture: (searchProfileId: string, triggerMode?: 'manual' | 'scheduled' | 'bootstrap') => Promise<unknown>;
  promoteCandidate: (candidateId: string) => Promise<unknown>;
};

const statusCodeFromError = (error: unknown) => {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null;
  const value = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isInteger(value) ? value : null;
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
      const statusCode = statusCodeFromError(error);
      if (statusCode === 422) {
        res.status(422).json({
          status: 'partial',
          error: error instanceof Error ? error.message : String(error),
          blockers: typeof error === 'object' && error !== null && 'blockers' in error
            ? (error as { blockers?: unknown }).blockers
            : [],
        });
        return;
      }
      next(error);
    }
  });

  return router;
};
