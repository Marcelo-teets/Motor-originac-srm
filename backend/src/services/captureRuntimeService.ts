import type { PlatformRepository } from '../repositories/platformRepository.js';
import { DataCaptureEngine } from '../modules/data-capture/dataCaptureEngine.js';
import { CapturePersistenceService } from './capturePersistenceService.js';
import { CaptureDerivedSyncService } from './captureDerivedSyncService.js';

export type CaptureRuntimeOptions = {
  companyId?: string;
  sourceId?: string;
  triggerType?: 'manual' | 'scheduled' | 'cron' | 'orchestrated';
  reason?: string;
};

const runtimeDecision = (input: {
  companiesProcessed: number;
  outputsCollected: number;
  persistedStatus: string;
  persistedErrors: string[];
}) => {
  if (input.persistedErrors.length) {
    return {
      status: 'partial' as const,
      httpStatus: 207,
      decision: 'partial_persistence',
      nextAction: 'Review persistence errors before using new data in ranking or commercial outreach.',
    };
  }

  if (!input.companiesProcessed) {
    return {
      status: 'partial' as const,
      httpStatus: 207,
      decision: 'no_company_processed',
      nextAction: 'Validate companyId/sourceId filters and active source catalog.',
    };
  }

  if (!input.outputsCollected) {
    return {
      status: 'partial' as const,
      httpStatus: 207,
      decision: 'no_new_evidence',
      nextAction: 'Check connectors, active sources and company matching.',
    };
  }

  if (input.persistedStatus !== 'real') {
    return {
      status: 'partial' as const,
      httpStatus: 207,
      decision: 'non_real_persistence',
      nextAction: 'Validate Supabase credentials and runtime tables.',
    };
  }

  return {
    status: 'real' as const,
    httpStatus: 200,
    decision: 'capture_persisted',
    nextAction: 'Use outputs, signals and enrichments in qualification, patterns, ranking and thesis.',
  };
};

export class CaptureRuntimeService {
  private readonly engine = new DataCaptureEngine();
  private readonly persistence = new CapturePersistenceService();
  private readonly derivedSync = new CaptureDerivedSyncService();

  constructor(private readonly repository: PlatformRepository) {}

  async run(options: CaptureRuntimeOptions = {}) {
    const startedAt = new Date().toISOString();
    const [companies, sources, patternCatalog] = await Promise.all([
      this.repository.listCompanies(),
      this.repository.listSources(),
      this.repository.listPatternCatalog(),
    ]);

    const targetCompanies = options.companyId
      ? companies.filter((company) => company.id === options.companyId)
      : companies;

    const targetSources = options.sourceId
      ? sources.filter((source) => source.id === options.sourceId)
      : sources;

    const captureResults = await this.engine.run({
      companyId: options.companyId,
      sourceId: options.sourceId,
      scopeType: options.companyId ? 'company' : options.sourceId ? 'source' : 'global',
      triggerType: options.triggerType ?? 'manual',
    }, targetCompanies, targetSources);

    const reason = options.reason ?? options.triggerType ?? 'manual';
    const persisted = await this.persistence.persist(captureResults, reason);
    const derived = await this.derivedSync.sync({
      companies: targetCompanies,
      patternCatalog,
      captureResults,
      reason,
    });

    const outputsCollected = captureResults.reduce((sum, result) => sum + result.outputs.length, 0);
    const signalsCollected = captureResults.reduce((sum, result) => sum + result.signals.length, 0);
    const enrichmentsCollected = captureResults.reduce((sum, result) => sum + result.enrichments.length, 0);
    const documentsCollected = captureResults.reduce((sum, result) => sum + result.documents.length, 0);
    const persistedErrors = Array.isArray(persisted.errors) ? persisted.errors : [];
    const operational = runtimeDecision({
      companiesProcessed: captureResults.length,
      outputsCollected,
      persistedStatus: persisted.status,
      persistedErrors,
    });
    const finishedAt = new Date().toISOString();

    return {
      status: operational.status,
      startedAt,
      finishedAt,
      requested: {
        companyId: options.companyId ?? null,
        sourceId: options.sourceId ?? null,
        triggerType: options.triggerType ?? 'manual',
        reason,
      },
      operational: {
        ...operational,
        persistenceStatus: persisted.status,
        persistenceErrors: persistedErrors,
        runsWritten: persisted.runsWritten,
        outputsWritten: persisted.outputsWritten,
        signalsWritten: persisted.signalsWritten,
        enrichmentsWritten: persisted.enrichmentsWritten,
        documentsWritten: persisted.documentsWritten,
        qualityGatesRun: persisted.qualityGatesRun,
      },
      companiesAvailable: companies.length,
      sourcesAvailable: sources.length,
      patternCatalogAvailable: patternCatalog.length,
      companiesProcessed: captureResults.length,
      sourcesProcessed: targetSources.length,
      outputsCollected,
      signalsCollected,
      enrichmentsCollected,
      documentsCollected,
      persisted,
      derived,
    };
  }
}
