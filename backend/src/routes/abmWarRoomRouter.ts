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
import { DataEnginesPersistence } from '../modules/data-engines/persistence.js';
import { PaperclipBrainService } from '../modules/paperclip/paperclipBrainService.js';

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
  const persistence = new DataEnginesPersistence();
  const paperclip = new PaperclipBrainService();

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

  router.get('/data-engines/learning-events', async (_req, res) => {
    res.json(ok(await persistence.listLearningEvents()));
  });

  router.get('/data-engines/requests', async (_req, res) => {
    res.json(ok(await persistence.listEngineRequests()));
  });

  router.get('/data-engines/improvement-proposals', async (_req, res) => {
    res.json(ok(await persistence.listImprovementProposals()));
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
    await persistence.saveCaptureArtifacts(captureResults);
    await persistence.saveLearningEvent({
      engineName: 'data_capture_engine',
      eventType: 'capture_run_completed',
      severity: 'info',
      summary: `Capture run completed for ${captureResults.length} companies.`,
      companyId,
      payload: {
        outputsWritten: captureResults.reduce((sum, item) => sum + item.outputs.length, 0),
        signalsWritten: captureResults.reduce((sum, item) => sum + item.signals.length, 0),
      },
    });

    const outputs = await repository.listMonitoringOutputs();
    const enrichmentResults = treatmentEngine.run(
      { companyId, reason: 'orchestrated' },
      companyId ? companies.filter((item) => item.id === companyId) : companies,
      outputs,
    );
    await persistence.saveAliases(enrichmentResults.flatMap((item) => item.aliases));

    const lowConfidenceOutputs = captureResults.flatMap((item) => item.outputs).filter((item) => item.confidenceScore < 0.65);
    if (lowConfidenceOutputs.length) {
      await persistence.saveImprovementProposal({
        engineName: 'data_capture_engine',
        proposalType: 'connector_upgrade',
        title: 'Improve low-confidence capture outputs',
        rationale: 'Capture run generated low-confidence outputs that should be improved with better parsing or source-specific extraction.',
        targetModule: 'backend/src/lib/connectors.ts',
        proposalPayload: {
          lowConfidenceOutputs: lowConfidenceOutputs.length,
          companies: [...new Set(lowConfidenceOutputs.map((item) => item.companyId))],
        },
      });
    }

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

    await persistence.saveEngineRequests(needsCapture.map((id) => ({
      requesterEngine: 'data_enrichment_engine',
      targetEngine: 'data_capture_engine',
      companyId: id,
      requestType: 'recheck_website',
      priority: 'high',
      status: 'queued',
      reason: 'Enrichment detected missing or low-confidence evidence and requested cooperative capture.',
      evidencePayload: { requestedBy: 'enrichment_run' },
    })));

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
      await persistence.saveCaptureArtifacts(captureResults);
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

    await persistence.saveAliases(enrichmentResults.flatMap((item) => item.aliases));
    await persistence.saveLearningEvent({
      engineName: 'data_enrichment_engine',
      eventType: needsCapture.length ? 'enrichment_with_cooperative_capture' : 'enrichment_run_completed',
      severity: needsCapture.length ? 'warning' : 'info',
      summary: `Enrichment run completed for ${enrichmentResults.length} companies.`,
      companyId,
      payload: {
        aliasesGenerated: enrichmentResults.reduce((sum, item) => sum + item.aliases.length, 0),
        captureRequestsCreated: enrichmentResults.reduce((sum, item) => sum + item.requestsCreated, 0),
        requestedCaptureFor: needsCapture,
      },
    });

    if (needsCapture.length) {
      await persistence.saveImprovementProposal({
        engineName: 'data_enrichment_engine',
        proposalType: 'evidence_gap',
        title: 'Improve evidence coverage for enrichment',
        rationale: 'Enrichment repeatedly required cooperative capture to fill missing evidence.',
        targetModule: 'backend/src/modules/data-enrichment/dataTreatmentEngine.ts',
        proposalPayload: {
          requestedCaptureFor: needsCapture,
          companiesProcessed: enrichmentResults.length,
        },
      });
    }

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

  router.get('/paperclip/snapshot', async (_req, res) => {
    res.json(ok(await paperclip.snapshot()));
  });

  return router;
};
