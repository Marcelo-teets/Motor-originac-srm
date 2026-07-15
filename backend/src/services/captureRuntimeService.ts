import type { PlatformRepository } from '../repositories/platformRepository.js';
import { DataCaptureEngine } from '../modules/data-capture/dataCaptureEngine.js';
import { CapturePersistenceService } from './capturePersistenceService.js';
import { CaptureDerivedSyncService } from './captureDerivedSyncService.js';
import { isProbativeMonitoringOutput } from '../modules/data-capture/outputEvidence.js';

export type CaptureRuntimeOptions = {
  companyId?: string;
  sourceId?: string;
  triggerType?: 'manual' | 'scheduled' | 'cron' | 'orchestrated';
  reason?: string;
};

export class CaptureRuntimeInputError extends Error {
  constructor(message: string, readonly statusCode: 404 | 422) {
    super(message);
  }
}

const sourceCode = (source: Awaited<ReturnType<PlatformRepository['listSources']>>[number]) => (
  typeof source.metadata?.code === 'string' ? source.metadata.code : source.id
);

const isRunnableSource = (source: Awaited<ReturnType<PlatformRepository['listSources']>>[number]) => {
  const code = sourceCode(source);
  return source.sourceType === 'rss'
    || source.sourceType === 'sitemap'
    || code === 'src_brasilapi_cnpj'
    || code === 'src_company_website'
    || code === 'src_mais_retorno_api';
};

export class CaptureRuntimeService {
  private readonly engine = new DataCaptureEngine();
  private readonly persistence = new CapturePersistenceService();
  private readonly derivedSync = new CaptureDerivedSyncService();

  constructor(private readonly repository: PlatformRepository) {}

  async run(options: CaptureRuntimeOptions = {}) {
    const [companies, sources, patternCatalog] = await Promise.all([
      this.repository.listCompanies(),
      this.repository.listSources(),
      this.repository.listPatternCatalog(),
    ]);

    const targetCompanies = options.companyId
      ? companies.filter((company) => company.id === options.companyId)
      : companies;

    const targetSources = options.sourceId
      ? sources.filter((source) => source.id === options.sourceId || sourceCode(source) === options.sourceId)
      : sources;

    if (options.companyId && !targetCompanies.length) {
      throw new CaptureRuntimeInputError(`Company not found: ${options.companyId}`, 404);
    }
    if (options.sourceId && !targetSources.length) {
      throw new CaptureRuntimeInputError(`Source not found: ${options.sourceId}`, 404);
    }
    if (options.sourceId && !targetSources.some(isRunnableSource)) {
      throw new CaptureRuntimeInputError(`Source is catalogued but does not have an operational capture adapter yet: ${options.sourceId}`, 422);
    }

    const resolvedSourceId = options.sourceId ? targetSources[0].id : undefined;

    const captureResults = await this.engine.run({
      companyId: options.companyId,
      sourceId: resolvedSourceId,
      scopeType: options.companyId ? 'company' : options.sourceId ? 'source' : 'global',
      triggerType: options.triggerType ?? 'manual',
    }, targetCompanies, targetSources);

    const reason = options.reason ?? options.triggerType ?? 'manual';
    const persisted = await this.persistence.persist(captureResults, reason);
    const derivableResults = captureResults.filter((result) => result.run.status !== 'failed'
      && result.outputs.some(isProbativeMonitoringOutput));
    const derivableCompanyIds = new Set(derivableResults.map((result) => result.run.companyId));
    const derived = derivableResults.length
      ? await this.derivedSync.sync({
        companies: targetCompanies.filter((company) => derivableCompanyIds.has(company.id)),
        patternCatalog,
        captureResults: derivableResults,
        reason,
      })
      : {
        status: 'partial' as const,
        qualificationsWritten: 0,
        patternsWritten: 0,
        scoreSnapshotsWritten: 0,
        leadScoreSnapshotsWritten: 0,
        pipelineRowsTouched: 0,
        errors: ['Derived sync skipped because the capture produced no probative evidence.'],
      };
    const captureStatus = captureResults.length > 0
      && captureResults.every((result) => result.run.status === 'completed')
      ? 'real' as const
      : 'partial' as const;
    const status = captureStatus === 'real' && persisted.status === 'real' && derived.status === 'real'
      ? 'real' as const
      : 'partial' as const;

    return {
      status,
      requested: {
        companyId: options.companyId ?? null,
        sourceId: options.sourceId ?? null,
        triggerType: options.triggerType ?? 'manual',
      },
      companiesAvailable: companies.length,
      sourcesAvailable: sources.length,
      patternCatalogAvailable: patternCatalog.length,
      companiesProcessed: captureResults.length,
      outputsCollected: captureResults.reduce((sum, result) => sum + result.outputs.length, 0),
      signalsCollected: captureResults.reduce((sum, result) => sum + result.signals.length, 0),
      enrichmentsCollected: captureResults.reduce((sum, result) => sum + result.enrichments.length, 0),
      documentsCollected: captureResults.reduce((sum, result) => sum + result.documents.length, 0),
      persisted,
      derived,
    };
  }
}
