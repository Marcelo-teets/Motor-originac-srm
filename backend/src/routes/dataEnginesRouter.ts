import { Router } from 'express';
import { DataCaptureEngine } from '../modules/data-capture/dataCaptureEngine.js';
import { DataTreatmentEngine } from '../modules/data-enrichment/dataTreatmentEngine.js';
import { DataEnginesPersistence } from '../modules/data-engines/persistence.js';
import { PaperclipBrainService } from '../modules/paperclip/paperclipBrainService.js';
import { createPlatformRepository } from '../repositories/platformRepository.js';
import { env } from '../lib/env.js';

const ok = (data: unknown) => ({ status: 'real', generatedAt: new Date().toISOString(), data });

export const createDataEnginesRouter = () => {
  const router = Router();
  const repository = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
  const captureEngine = new DataCaptureEngine();
  const treatmentEngine = new DataTreatmentEngine();
  const persistence = new DataEnginesPersistence();
  const paperclip = new PaperclipBrainService();

  router.get('/health', async (_req, res) => {
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

  router.get('/learning-events', async (_req, res) => {
    res.json(ok(await persistence.listLearningEvents()));
  });

  router.get('/requests', async (_req, res) => {
    res.json(ok(await persistence.listEngineRequests()));
  });

  router.get('/improvement-proposals', async (_req, res) => {
    res.json(ok(await persistence.listImprovementProposals()));
  });

  router.post('/capture/run', async (req, res) => {
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
      payload: {\n        outputsWritten: captureResults.reduce((sum, item) => sum + item.outputs.length, 0),\n        signalsWritten: captureResults.reduce((sum, item) => sum + item.signals.length, 0),\n      },\n    });

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
        proposalPayload: {\n          lowConfidenceOutputs: lowConfidenceOutputs.length,\n          companies: [...new Set(lowConfidenceOutputs.map((item) => item.companyId))],\n        },\n      });
    }

    res.json(ok({\n      engine: 'data_capture_engine',\n      companiesProcessed: captureResults.length,\n      outputsWritten: captureResults.reduce((sum, item) => sum + item.outputs.length, 0),\n      signalsWritten: captureResults.reduce((sum, item) => sum + item.signals.length, 0),\n      enrichmentsWritten: captureResults.reduce((sum, item) => sum + item.enrichments.length, 0),\n      cooperativeEnrichment: {\n        companiesProcessed: enrichmentResults.length,\n        aliasesGenerated: enrichmentResults.reduce((sum, item) => sum + item.aliases.length, 0),\n        captureRequestsCreated: enrichmentResults.reduce((sum, item) => sum + item.requestsCreated, 0),\n      },\n    }));
  });

  router.post('/enrichment/run', async (req, res) => {
    const companyId = typeof req.body?.companyId === 'string' ? req.body.companyId : undefined;
    const companies = await repository.listCompanies();
    let outputs = await repository.listMonitoringOutputs();
    const targets = companyId ? companies.filter((item) => item.id === companyId) : companies;

    const needsCapture = targets\n      .filter((company) => {\n        const companyOutputs = outputs.filter((item) => item.companyId === company.id);\n        return companyOutputs.length === 0 || companyOutputs.some((item) => item.confidenceScore < 0.65);\n      })\n      .map((item) => item.id);

    await persistence.saveEngineRequests(needsCapture.map((id) => ({\n      requesterEngine: 'data_enrichment_engine',\n      targetEngine: 'data_capture_engine',\n      companyId: id,\n      requestType: 'recheck_website',\n      priority: 'high',\n      status: 'queued',\n      reason: 'Enrichment detected missing or low-confidence evidence and requested cooperative capture.',\n      evidencePayload: { requestedBy: 'enrichment_run' },\n    })));

    let cooperativeCapture = null;
    if (needsCapture.length) {\n      const sources = await repository.listSources();\n      const captureResults = await captureEngine.run(\n        {\n          scopeType: companyId ? 'company' : 'global',\n          triggerType: 'orchestrated',\n        },\n        companies.filter((item) => needsCapture.includes(item.id)),\n        sources,\n      );\n\n      await repository.saveMonitoringOutputs(captureResults.flatMap((item) => item.outputs));\n      await repository.saveCompanySignals(captureResults.flatMap((item) => item.signals));\n      await repository.saveEnrichments(captureResults.flatMap((item) => item.enrichments));\n      await persistence.saveCaptureArtifacts(captureResults);\n      outputs = await repository.listMonitoringOutputs();\n\n      cooperativeCapture = {\n        companiesProcessed: captureResults.length,\n        outputsWritten: captureResults.reduce((sum, item) => sum + item.outputs.length, 0),\n      };\n    }\n\n    const enrichmentResults = treatmentEngine.run(
      { companyId, reason: needsCapture.length ? 'orchestrated' : 'manual' },\n      targets,\n      outputs,\n    );\n\n    await persistence.saveAliases(enrichmentResults.flatMap((item) => item.aliases));\n    await persistence.saveLearningEvent({\n      engineName: 'data_enrichment_engine',\n      eventType: needsCapture.length ? 'enrichment_with_cooperative_capture' : 'enrichment_run_completed',\n      severity: needsCapture.length ? 'warning' : 'info',\n      summary: `Enrichment run completed for ${enrichmentResults.length} companies.`,\n      companyId,\n      payload: {\n        aliasesGenerated: enrichmentResults.reduce((sum, item) => sum + item.aliases.length, 0),\n        captureRequestsCreated: enrichmentResults.reduce((sum, item) => sum + item.requestsCreated, 0),\n        requestedCaptureFor: needsCapture,\n      },\n    });\n\n    if (needsCapture.length) {\n      await persistence.saveImprovementProposal({\n        engineName: 'data_enrichment_engine',\n        proposalType: 'evidence_gap',\n        title: 'Improve evidence coverage for enrichment',\n        rationale: 'Enrichment repeatedly required cooperative capture to fill missing evidence.',\n        targetModule: 'backend/src/modules/data-enrichment/dataTreatmentEngine.ts',\n        proposalPayload: {\n          requestedCaptureFor: needsCapture,\n          companiesProcessed: enrichmentResults.length,\n        },\n      });\n    }\n\n    res.json(ok({\n      engine: 'data_enrichment_engine',\n      companiesProcessed: enrichmentResults.length,\n      aliasesGenerated: enrichmentResults.reduce((sum, item) => sum + item.aliases.length, 0),\n      captureRequestsCreated: enrichmentResults.reduce((sum, item) => sum + item.requestsCreated, 0),\n      requestedCaptureFor: needsCapture,\n      cooperativeCapture,\n      results: enrichmentResults,\n    }));\n  });\n\n  router.get('/paperclip/snapshot', async (_req, res) => {\n    res.json(ok(await paperclip.snapshot()));\n  });\n\n  return router;\n};
