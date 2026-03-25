import { Router } from 'express';
import { createPlatformRepository } from '../repositories/platformRepository.js';
import { env } from '../lib/env.js';
import { PlatformService } from '../services/platformService.js';
import { CompanyDecisionMemoService } from '../services/companyDecisionMemoService.js';

export const createCompanyDecisionMemoRouter = () => {
  const router = Router();
  const repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
  const platformService = new PlatformService(repository);
  const service = new CompanyDecisionMemoService(platformService);

  router.get('/:companyId', async (req, res, next) => {
    try {
      const memo = await service.build(String(req.params.companyId));
      res.json({ status: memo ? 'real' : 'partial', data: memo });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
