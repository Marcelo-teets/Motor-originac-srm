import { Router } from 'express';
import { DataIntelligenceService } from '../services/dataIntelligenceService.js';
import { EntityResolutionService } from '../services/entityResolutionService.js';

export const createDataIntelligenceRouter = () => {
  const router = Router();
  const dataService = new DataIntelligenceService();
  const entityResolution = new EntityResolutionService();

  router.get('/catalog', async (_req, res, next) => {
    try {
      res.json({ status: 'real', data: await dataService.listCatalog() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/catalog/seed', async (_req, res, next) => {
    try {
      res.json({ status: 'real', data: await dataService.seedCatalog() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/runs/start', async (req, res, next) => {
    try {
      const sourceEndpointId = String(req.body?.sourceEndpointId ?? '');
      res.status(201).json({ status: 'real', data: await dataService.createIngestionRun(sourceEndpointId, String(req.body?.runType ?? 'manual')) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/runs/:id/finalize', async (req, res, next) => {
    try {
      res.json({ status: 'real', data: await dataService.finalizeIngestionRun(String(req.params.id), {
        status: req.body?.status === 'failed' ? 'failed' : 'completed',
        httpStatus: typeof req.body?.httpStatus === 'number' ? req.body.httpStatus : undefined,
        recordsSeen: typeof req.body?.recordsSeen === 'number' ? req.body.recordsSeen : undefined,
        recordsInserted: typeof req.body?.recordsInserted === 'number' ? req.body.recordsInserted : undefined,
        recordsUpdated: typeof req.body?.recordsUpdated === 'number' ? req.body.recordsUpdated : undefined,
        errorMessage: req.body?.errorMessage ? String(req.body.errorMessage) : undefined,
        metadata: typeof req.body?.metadata === 'object' && req.body?.metadata ? req.body.metadata : undefined,
      }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/raw-documents', async (req, res, next) => {
    try {
      res.status(201).json({ status: 'real', data: await dataService.saveRawDocument({
        sourceEndpointId: String(req.body?.sourceEndpointId ?? ''),
        externalId: req.body?.externalId ? String(req.body.externalId) : undefined,
        canonicalUrl: req.body?.canonicalUrl ? String(req.body.canonicalUrl) : undefined,
        title: req.body?.title ? String(req.body.title) : undefined,
        publishedAt: req.body?.publishedAt ? String(req.body.publishedAt) : undefined,
        mimeType: req.body?.mimeType ? String(req.body.mimeType) : undefined,
        language: req.body?.language ? String(req.body.language) : undefined,
        rawPayload: typeof req.body?.rawPayload === 'object' && req.body?.rawPayload ? req.body.rawPayload : undefined,
        parsedText: req.body?.parsedText ? String(req.body.parsedText) : undefined,
        metadata: typeof req.body?.metadata === 'object' && req.body?.metadata ? req.body.metadata : undefined,
      }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/companies/:companyId/aliases', async (req, res, next) => {
    try {
      res.status(201).json({ status: 'real', data: await entityResolution.ensureAlias(String(req.params.companyId), String(req.body?.alias ?? ''), String(req.body?.aliasType ?? 'brand')) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/companies/:companyId/enrich', async (req, res, next) => {
    try {
      res.json({ status: 'real', data: await dataService.enrichCompanyFromDocument({
        companyId: String(req.params.companyId),
        rawDocumentId: String(req.body?.rawDocumentId ?? ''),
        text: String(req.body?.text ?? ''),
        title: req.body?.title ? String(req.body.title) : undefined,
      }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/entity-resolution/match', async (req, res, next) => {
    try {
      res.json({ status: 'real', data: await entityResolution.findBestCompanyMatch({
        name: req.body?.name ? String(req.body.name) : undefined,
        cnpj: req.body?.cnpj ? String(req.body.cnpj) : undefined,
        website: req.body?.website ? String(req.body.website) : undefined,
      }) });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
