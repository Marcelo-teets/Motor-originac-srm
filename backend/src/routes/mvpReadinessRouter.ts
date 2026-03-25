import { Router } from 'express';
import { createPlatformRepository } from '../repositories/platformRepository.js';
import { env } from '../lib/env.js';
import { PlatformService } from '../services/platformService.js';
import { MvpReadinessService } from '../services/mvpReadinessService.js';

export const createMvpReadinessRouter = () => {
  const router = Router();
  const repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
  const platformService = new PlatformService(repository);
  const service = new MvpReadinessService(platformService);

  router.get('/', async (_req, res, next) => {
    try {
      res.json({ status: 'real', data: await service.build() });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
