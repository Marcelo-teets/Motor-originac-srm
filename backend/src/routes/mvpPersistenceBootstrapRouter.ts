import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase.js';
import { MvpPersistenceBootstrapService } from '../services/persistence/mvpPersistenceBootstrapService.js';

export function createMvpPersistenceBootstrapRouter() {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const client = getSupabaseClient();
      if (!client) {
        res.status(503).json({
          status: 'partial',
          error: 'Supabase client not configured',
          data: null,
        });
        return;
      }

      const service = new MvpPersistenceBootstrapService(client);
      const result = await service.persistAll({
        rankingRows: Array.isArray(req.body?.rankingRows) ? req.body.rankingRows : [],
        thesisRows: Array.isArray(req.body?.thesisRows) ? req.body.thesisRows : [],
        scoreHistoryRows: Array.isArray(req.body?.scoreHistoryRows) ? req.body.scoreHistoryRows : [],
        pipelineRows: Array.isArray(req.body?.pipelineRows) ? req.body.pipelineRows : [],
        pipelineHistoryRows: Array.isArray(req.body?.pipelineHistoryRows) ? req.body.pipelineHistoryRows : [],
        activityRows: Array.isArray(req.body?.activityRows) ? req.body.activityRows : [],
        taskRows: Array.isArray(req.body?.taskRows) ? req.body.taskRows : [],
      });

      res.json({
        status: 'real',
        generatedAt: new Date().toISOString(),
        data: result,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        status: 'partial',
        error: error instanceof Error ? error.message : 'Unexpected persistence bootstrap error',
        data: null,
      });
    }
  });

  return router;
}
