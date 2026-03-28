import { Router } from 'express';
import { AccountStakeholderService } from '../services/accountStakeholderService.js';
import { CommercialMomentumService } from '../services/commercialMomentumService.js';
import { CommercialPriorityService } from '../services/commercialPriorityService.js';
import { ObjectionIntelligenceService } from '../services/objectionIntelligenceService.js';
import { PreCallBriefingService } from '../services/preCallBriefingService.js';
import { TouchpointService } from '../services/touchpointService.js';
import { DataCaptureEngine } from '../modules/data-capture/dataCaptureEngine.js';
import { DataTreatmentEngine } from '../modules/data-enrichment/dataTreatmentEngine.js';
import { createPlatformRepository } from '../repositories/platformRepository.js';
import { env } from '../lib/env.js';

const ok = (data: unknown) => ({ status: 'real', generatedAt: new Date().toISOString(), data });

export const createAbmWarRoomRouter = () => {
  const router = Router();
  const stakeholderService = new AccountStakeholderService();
  const touchpointService = new TouchpointService();
  const objectionService = new ObjectionIntelligenceService();
  const momentumService = new CommercialMomentumService();
  const priorityService = new CommercialPriorityService();
  const briefingService = new PreCallBriefingService();
  const repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
  const captureEngine = new DataCaptureEngine();
  const treatmentEngine = new DataTreatmentEngine();

  router.get('/companies/:companyId/stakeholders', async (req, res) => {
    res.json(ok(await stakeholderService.listByCompany(req.params.companyId)));
  });

  router.post('/companies/:companyId/stakeholders', async (req, res) => {
    const created = await stakeholderService.create(req.params.companyId, req.body ?? {});
    res.status(201).json(ok(created));
  });

  router.get('/companies/:companyId/touchpoints', async (req, res) => {
    res.json(ok(await touchpointService.listByCompany(req.params.companyId)));
  });

  router.post('/companies/:companyId/touchpoints', async (req, res) => {
    const created = await touchpointService.create(req.params.companyId, req.body ?? {});
    res.status(201).json(ok(created));
  });

  router.get('/companies/:companyId/objections', async (req, res) => {
    res.json(ok(await objectionService.listByCompany(req.params.companyId)));
  });

  router.post('/companies/:companyId/objections', async (req, res) => {
    const created = await objectionService.create(req.params.companyId, req.body ?? {});
    res.status(201).json(ok(created));
  });

  router.get('/war-room/weekly', async (_req, res) => {
    res.json(ok(await briefingService.weeklyWarRoom()));
  });

  router.get('/companies/:companyId/pre-call-briefing', async (req, res) => {
    res.json(ok(await briefingService.build(req.params.companyId)));
  });

  router.get('/companies/:companyId/pre-mortem', async (req, res) => {
    res.json(ok(await briefingService.buildPreMortem(req.params.companyId)));
  });

  router.post('/companies/:companyId/recalculate-commercial-layer', async (req, res) => {
    const companyId = req.params.companyId;
    const [momentum, priority] = await Promise.all([
      momentumService.compute(companyId),
      priorityService.compute(companyId),
    ]);
    res.json(ok({ companyId, momentum, priority, reason: req.body?.reason ?? 'manual' }));
  });

  router.get('/data-engines/health', async (_req, res) => {
    const [companies, sources, outputs] = await Promise.all([
      repository.listCompanies(),
      repository.listSources(),
      repository.listMonitoringOutputs(),
    ]);

    res.json(ok({
      engines: ['data_capture_engine', 'data_enrichment_engine'],
      companies: companies.length,
      sources: sources.length,
      monitoringOutputs: outputs.length,
    }));
  });

  router.post('/data-engines/capture/run', async (req, res) => {
    const companyId = typeof req.body?.companyId === 'string' ? req.body.companyId : undefined;
    const [companies, sources] = await Promise.all([
      repository.listCompanies(),
      repository.listSources(),
    ]);

    const captureResults = await captureEngine.run(
      {
        companyId,
        sourceId: typeof req.body?.sourceId === 'string' ? req.body.sourceId : undefined,
        scopeType: companyId ? 'company' : 'global',
        triggerType: 'manual',
      },
      companies,
      sources,
    );

    await repository.saveMonitoringOutputs(captureResults.flatMap((item) => item.outputs));
    await repository.saveCompanySignals(captureResults.flatMap((item) => item.signals));
    await repository.saveEnrichments(captureResults.flatMap((item) => item.enrichments));

    const outputs = await repository.listMonitoringOutputs();
    const enrichmentResults = treatmentEngine.run(
      { companyId, reason: 'orchestrated' },
      companyId ? companies.filter((item) => item.id === companyId) : companies,
      outputs,
    );

    res.json(ok({
      engine: 'data_capture_engine',
      companiesProcessed: captureResults.length,
      outputsWritten: captureResults.reduce((sum, item) => sum + item.outputs.length, 0),
      signalsWritten: captureResults.reduce((sum, item) => sum + item.signals.length, 0),
      enrichmentsWritten: captureResults.reduce((sum, item) => sum + item.enrichments.length, 0),
      cooperativeEnrichment: {
        companiesProcessed: enrichmentResults.length,
        aliasesGenerated: enrichmentResults.reduce((sum, item) => sum + item.aliases.length, 0),
        captureRequestsCreated: enrichmentResults.reduce((sum, item) => sum + item.requestsCreated, 0),
      },
    }));
  });

  router.post('/data-engines/enrichment/run', async (req, res) => {
    const companyId = typeof req.body?.companyId === 'string' ? req.body.companyId : undefined;
    const companies = await repository.listCompanies();
    let outputs = await repository.listMonitoringOutputs();
    const targets = companyId ? companies.filter((item) => item.id === companyId) : companies;

    const needsCapture = targets
      .filter((company) => {
        const companyOutputs = outputs.filter((item) => item.companyId === company.id);
        return companyOutputs.length === 0 || companyOutputs.some((item) => item.confidenceScore < 0.65);
      })
      .map((item) => item.id);

    let cooperativeCapture = null;
    if (needsCapture.length) {
      const sources = await repository.listSources();
      const captureResults = await captureEngine.run(
        {
          scopeType: companyId ? 'company' : 'global',
          triggerType: 'orchestrated',
        },
        companies.filter((item) => needsCapture.includes(item.id)),
        sources,
      );

      await repository.saveMonitoringOutputs(captureResults.flatMap((item) => item.outputs));
      await repository.saveCompanySignals(captureResults.flatMap((item) => item.signals));
      await repository.saveEnrichments(captureResults.flatMap((item) => item.enrichments));
      outputs = await repository.listMonitoringOutputs();

      cooperativeCapture = {
        companiesProcessed: captureResults.length,
        outputsWritten: captureResults.reduce((sum, item) => sum + item.outputs.length, 0),
      };
    }

    const enrichmentResults = treatmentEngine.run(
      { companyId, reason: needsCapture.length ? 'orchestrated' : 'manual' },
      targets,
      outputs,
    );

    res.json(ok({
      engine: 'data_enrichment_engine',
      companiesProcessed: enrichmentResults.length,
      aliasesGenerated: enrichmentResults.reduce((sum, item) => sum + item.aliases.length, 0),
      captureRequestsCreated: enrichmentResults.reduce((sum, item) => sum + item.requestsCreated, 0),
      requestedCaptureFor: needsCapture,
      cooperativeCapture,
      results: enrichmentResults,
    }));
  });

  return router;
};
