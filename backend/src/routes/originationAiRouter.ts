import { Router, type Request, type Response } from 'express';
import { originationIntroAgents } from '../ai/originationAgentDefinitions.js';
import { OriginationAiService } from '../services/originationAiService.js';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

export const createOriginationAiRouter = (service = new OriginationAiService()) => {
  const router = Router();
  const ok = (data: unknown) => ({ status: 'real', generatedAt: new Date().toISOString(), data });
  const handle = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      const clientError = /obrigat|não encontrada|não disponível|NOT_READY|Conflito crítico/i.test(message);
      res.status(clientError ? 400 : 500).json({ error: message, generatedAt: new Date().toISOString() });
    }
  };

  router.get('/agents', (_req, res) => res.json(ok(originationIntroAgents)));

  router.get('/companies/:companyId/evidence', handle(async (req, res) => {
    res.json(ok(await service.getEvidence(param(req.params.companyId))));
  }));

  router.post('/companies/:companyId/evidence', handle(async (req, res) => {
    const saved = await service.ingestEvidence(param(req.params.companyId), req.body ?? {});
    res.status(201).json(ok(saved));
  }));

  router.post('/companies/:companyId/deal-master/rebuild', handle(async (req, res) => {
    res.json(ok(await service.rebuildDealMaster(param(req.params.companyId))));
  }));

  router.get('/companies/:companyId/deal-master', handle(async (req, res) => {
    res.json(ok(await service.getDealMaster(param(req.params.companyId))));
  }));

  router.get('/companies/:companyId/conflicts', handle(async (req, res) => {
    res.json(ok(await service.getConflicts(param(req.params.companyId))));
  }));

  router.post('/companies/:companyId/conflicts/:conflictId/resolve', handle(async (req, res) => {
    res.json(ok(await service.resolveConflict(
      param(req.params.companyId),
      param(req.params.conflictId),
      {
        selectedEvidenceId: req.body?.selectedEvidenceId ? String(req.body.selectedEvidenceId) : undefined,
        resolutionNote: String(req.body?.resolutionNote ?? ''),
        resolvedBy: String(req.body?.resolvedBy ?? ''),
      },
    )));
  }));

  router.post('/companies/:companyId/readiness/recalculate', handle(async (req, res) => {
    res.json(ok(await service.recalculateReadiness(param(req.params.companyId))));
  }));

  router.post('/companies/:companyId/intro/generate', handle(async (req, res) => {
    res.json(ok(await service.generateIntro(param(req.params.companyId))));
  }));

  router.get('/companies/:companyId/intro/latest', handle(async (req, res) => {
    res.json(ok(await service.getLatestIntro(param(req.params.companyId))));
  }));

  router.post('/companies/:companyId/intro/:artifactId/approve', handle(async (req, res) => {
    res.json(ok(await service.approveIntro(
      param(req.params.companyId),
      param(req.params.artifactId),
      String(req.body?.approvedBy ?? ''),
    )));
  }));

  return router;
};
