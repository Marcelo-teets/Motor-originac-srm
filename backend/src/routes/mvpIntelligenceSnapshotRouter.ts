import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase.js';

export function createMvpIntelligenceSnapshotRouter() {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const client = getSupabaseClient();
      if (!client) {
        res.status(503).json({
          status: 'partial',
          error: 'Supabase client not configured',
          data: {
            ranking: [],
            thesis: [],
            pipeline: [],
          },
        });
        return;
      }

      const [ranking, thesis, pipeline] = await Promise.all([
        client.select('vw_latest_ranking_v2', { select: '*' }),
        client.select('vw_latest_thesis_outputs', { select: '*' }),
        client.select('vw_pipeline_current', { select: '*' }),
      ]);

      res.json({
        status: 'real',
        generatedAt: new Date().toISOString(),
        data: {
          ranking: ranking ?? [],
          thesis: thesis ?? [],
          pipeline: pipeline ?? [],
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        status: 'partial',
        error: error instanceof Error ? error.message : 'Unexpected intelligence snapshot error',
        data: {
          ranking: [],
          thesis: [],
          pipeline: [],
        },
      });
    }
  });

  return router;
}
