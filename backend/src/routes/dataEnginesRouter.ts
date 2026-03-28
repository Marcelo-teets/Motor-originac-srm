import { Router } from 'express';

export const createDataEnginesRouter = () => {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', engines: ['data_capture_engine', 'data_enrichment_engine'] });
  });

  router.post('/capture/run', (_req, res) => {
    res.json({ started: true, engine: 'data_capture_engine' });
  });

  router.post('/enrichment/run', (_req, res) => {
    res.json({ started: true, engine: 'data_enrichment_engine' });
  });

  return router;
};
