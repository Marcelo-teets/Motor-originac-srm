import type { PlatformRepository } from '../repositories/platformRepository.js';
import { DataCaptureEngine } from '../modules/data-capture/dataCaptureEngine.js';
import { CapturePersistenceService } from './capturePersistenceService.js';

export type CaptureRuntimeOptions = {
  companyId?: string;
  sourceId?: string;
  triggerType?: 'manual' | 'scheduled' | 'cron' | 'orchestrated';
  reason?: string;
};

export class CaptureRuntimeService {
  private readonly engine = new DataCaptureEngine();
  private readonly persistence = new CapturePersistenceService();

  constructor(private readonly repository: PlatformRepository) {}

  async run(options: CaptureRuntimeOptions = {}) {
    const [companies, sources] = await Promise.all([
      this.repository.listCompanies(),
      this.repository.listSources(),
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
      scopeType: options.companyId ? 'company' : 'global',
      triggerType: options.triggerType ?? 'manual',
    }, targetCompanies, targetSources);

    const persisted = await this.persistence.persist(captureResults, options.reason ?? options.triggerType ?? 'manual');

    return {
      requested: {
        companyId: options.companyId ?? null,
        sourceId: options.sourceId ?? null,
        triggerType: options.triggerType ?? 'manual',
      },
      companiesAvailable: companies.length,
      sourcesAvailable: sources.length,
      companiesProcessed: captureResults.length,
      outputsCollected: captureResults.reduce((sum, result) => sum + result.outputs.length, 0),
      signalsCollected: captureResults.reduce((sum, result) => sum + result.signals.length, 0),
      documentsCollected: captureResults.reduce((sum, result) => sum + result.documents.length, 0),
      persisted,
    };
  }
}
