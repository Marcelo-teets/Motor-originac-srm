import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase.js';

export function createMvpCheckpointRouter() {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const client = getSupabaseClient();
      if (!client) {
        res.status(503).json({
          status: 'partial',
          generatedAt: new Date().toISOString(),
          data: {
            supabaseConfigured: false,
            pipelineView: false,
            rankingView: false,
            thesisView: false,
          },
        });
        return;
      }

      const [pipeline, ranking, thesis] = await Promise.all([
        client.select('vw_pipeline_current', { select: '*', limit: 1 }).catch(() => []),
        client.select('vw_latest_ranking_v2', { select: '*', limit: 1 }).catch(() => []),
        client.select('vw_latest_thesis_outputs', { select: '*', limit: 1 }).catch(() => []),
      ]);

      res.json({
        status: 'real',
        generatedAt: new Date().toISOString(),
        data: {
          supabaseConfigured: true,
          pipelineView: Array.isArray(pipeline),
          rankingView: Array.isArray(ranking),
          thesisView: Array.isArray(thesis),
          pipelineCount: Array.isArray(pipeline) ? pipeline.length : 0,
          rankingCount: Array.isArray(ranking) ? ranking.length : 0,
          thesisCount: Array.isArray(thesis) ? thesis.length : 0,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        status: 'partial',
        generatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unexpected checkpoint error',
        data: null,
      });
    }
  });

  return router;
}
