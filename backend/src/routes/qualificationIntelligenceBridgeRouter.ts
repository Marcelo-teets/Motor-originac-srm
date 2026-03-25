import { Router } from 'express';
import { createPlatformRepository } from '../repositories/platformRepository.js';
import { env } from '../lib/env.js';
import { PlatformService } from '../services/platformService.js';
import { QualificationIntelligenceBridgeService } from '../services/qualificationIntelligenceBridgeService.js';

export const createQualificationIntelligenceBridgeRouter = () => {
  const router = Router();
  const repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
  const platformService = new PlatformService(repository);
  const service = new QualificationIntelligenceBridgeService(platformService);

  router.get('/:companyId', async (req, res, next) => {
    try {
      const bridge = await service.build(String(req.params.companyId));
      res.json({ status: bridge ? 'real' : 'partial', data: bridge });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
