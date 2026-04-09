import { Router } from 'express';
import { createPlatformRepository } from '../repositories/platformRepository.js';
import { env } from '../lib/env.js';
import { ingestCompanyMonitoring } from '../lib/connectors.runtime.highSignal.js';

const ok = (data: unknown) => ({ status: 'real', generatedAt: new Date().toISOString(), data });

export const createHighSignalScraperRouter = () => {
  const router = Router();
  const repo = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');

  router.get('/health', async (_req, res) => {
    const [companies, sources] = await Promise.all([repo.listCompanies(), repo.listSources()]);
    res.json(ok({ companies: companies.length, sources: sources.length, mode: env.useSupabase ? 'supabase' : 'memory' }));
  });

  router.post('/company/:companyId/run', async (req, res) => {
    const companyId = req.params.companyId;
    const [companies, sources] = await Promise.all([repo.listCompanies(), repo.listSources()]);
    const company = companies.find((item) => item.id === companyId);
    if (!company) return void res.status(404).json({ status: 'error', message: `Company not found: ${companyId}` });
    const result = await ingestCompanyMonitoring(company, sources);
    res.json(ok({ companyId, outputs: result.outputs, signals: result.signals, enrichments: result.enrichments }));
  });

  return router;
};
