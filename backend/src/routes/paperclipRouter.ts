import { Router } from 'express';
import type { PlatformService } from '../services/platformService.js';
import { buildPaperclipAgentCatalog, buildPaperclipScaffoldStatus } from '../modules/paperclipControlPlane.js';

const ok = (data: unknown) => ({ status: 'partial', generatedAt: new Date().toISOString(), data });

const resolveApiBaseUrl = () => process.env.PAPERCLIP_TARGET_API_BASE_URL || process.env.VITE_API_BASE_URL || `http://localhost:${process.env.PORT ?? '4000'}`;

export const createPaperclipRouter = (service: PlatformService) => {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json(ok(buildPaperclipScaffoldStatus(resolveApiBaseUrl())));
  });

  router.get('/agents', (_req, res) => {
    res.json(ok(buildPaperclipAgentCatalog(resolveApiBaseUrl())));
  });

  router.post('/orchestrate/company/:id', async (req, res) => {
    const companyId = req.params.id;
    const reason = String(req.body?.reason ?? 'paperclip_manual');

    await service.refreshMonitoring(companyId);
    const recomputed = await service.recalculateCompany(companyId, reason);
    const ranking = await service.getCompanyRanking(companyId);

    res.json(ok({
      companyId,
      reason,
      orchestrationMode: 'paperclip_scaffold',
      actionsExecuted: [
        'monitoring_refresh',
        'qualification_refresh',
        'ranking_refresh'
      ],
      recomputed,
      ranking,
    }));
  });

  return router;
};
