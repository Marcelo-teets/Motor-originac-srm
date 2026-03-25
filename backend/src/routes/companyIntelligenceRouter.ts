import { Router } from 'express';
import { CompanyIntelligenceService } from '../services/companyIntelligenceService.js';

export const createCompanyIntelligenceRouter = () => {
  const router = Router();
  const service = new CompanyIntelligenceService();

  router.get('/:companyId/summary', async (req, res, next) => {
    try {
      res.json({ status: 'real', data: await service.getCompanySummary(String(req.params.companyId)) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:companyId/facts', async (req, res, next) => {
    try {
      res.json({ status: 'real', data: await service.listCompanyFacts(String(req.params.companyId)) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:companyId/signals', async (req, res, next) => {
    try {
      res.json({ status: 'real', data: await service.listCompanySignals(String(req.params.companyId)) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:companyId/enrichment', async (req, res, next) => {
    try {
      res.json({ status: 'real', data: await service.listCompanyEnrichmentSnapshots(String(req.params.companyId)) });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
