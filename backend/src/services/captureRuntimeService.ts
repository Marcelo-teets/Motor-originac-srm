import type { PlatformRepository } from '../repositories/platformRepository.js';
import { env } from '../lib/env.js';
import { selectMonitoringCompanies } from '../lib/boundedCapture.js';
import { isCompanyDecisionEligible } from '../lib/companyDecisionEligibility.js';
import { DataCaptureEngine } from '../modules/data-capture/dataCaptureEngine.js';
import { filterCaptureResultsForDecision } from '../modules/data-capture/captureDecisionGate.js';
import { filterCaptureResultsForEntityRelevance } from '../modules/data-capture/captureEntityRelevanceGate.js';
import { CapturePersistenceService } from './capturePersistenceService.js';
import { CaptureDerivedSyncService } from './captureDerivedSyncService.js';

export type CaptureRuntimeOptions = {
  companyId?: string;
  sourceId?: string;
  triggerType?: 'manual' | 'scheduled' | 'cron' | 'orchestrated';
  reason?: string;
};

export class CaptureRuntimeService {
  private readonly engine = new DataCaptureEngine();
  private readonly persistence = new CapturePersistenceService();
  private readonly derivedSync = new CaptureDerivedSyncService();

  constructor(private readonly repository: PlatformRepository) {}

  async run(options: CaptureRuntimeOptions = {}) {
    const [allCompanies, sources, patternCatalog] = await Promise.all([
      this.repository.listCompanies(),
      this.repository.listSources(),
      this.repository.listPatternCatalog(),
    ]);
    const companies = selectMonitoringCompanies(allCompanies, env.useSupabase);

    const targetCompanies = options.companyId
      ? companies.filter((company) => company.id === options.companyId)
      : companies;

    const targetSources = options.sourceId
      ? sources.filter((source) => source.id === options.sourceId)
      : sources;

    if (options.companyId && !targetCompanies.length) {
      throw new Error(`Company is not monitoring-eligible or was not found: ${options.companyId}`);
    }
    if (options.sourceId && !targetSources.length) {
      throw new Error(`Source was not found: ${options.sourceId}`);
    }

    const captureResults = await this.engine.run({
      companyId: options.companyId,
      sourceId: options.sourceId,
      scopeType: options.companyId ? 'company' : 'global',
      triggerType: options.triggerType ?? 'manual',
    }, targetCompanies, targetSources);

    const reason = options.reason ?? options.triggerType ?? 'manual';

    // Preserve every raw output/document/treatment record, but never persist semantic signals or
    // enrichments that are not actually about the target company. This matters because inserting a
    // company_signal immediately feeds the Factor Map through database triggers.
    const prePersistenceEntityGate = filterCaptureResultsForEntityRelevance(captureResults, targetCompanies);
    const persistenceCaptureResults = captureResults.map((result, index) => ({
      ...result,
      signals: prePersistenceEntityGate.results[index]?.signals ?? [],
      enrichments: prePersistenceEntityGate.results[index]?.enrichments ?? [],
    }));

    const persisted = await this.persistence.persist(persistenceCaptureResults, reason);
    const qualityDecisionResults = filterCaptureResultsForDecision(captureResults, persisted.decisionGate);
    const entityRelevanceGate = filterCaptureResultsForEntityRelevance(qualityDecisionResults, targetCompanies);
    const decisionCaptureResults = entityRelevanceGate.results;

    // Decision artifacts are narrower than persisted raw evidence: Company Master eligibility,
    // treatment/quality and semantic entity relevance must all pass before qualification, patterns,
    // scores, ranking inputs or pipeline can move.
    const companiesWithEligibleEvidence = new Set(
      decisionCaptureResults
        .filter((result) => result.outputs.length > 0)
        .map((result) => result.run.companyId)
        .filter((companyId): companyId is string => Boolean(companyId)),
    );
    const decisionCompanies = targetCompanies.filter((company) =>
      isCompanyDecisionEligible(company) && companiesWithEligibleEvidence.has(company.id));

    const derived = await this.derivedSync.sync({
      companies: decisionCompanies,
      patternCatalog,
      captureResults: decisionCaptureResults,
      reason,
    });

    return {
      requested: {
        companyId: options.companyId ?? null,
        sourceId: options.sourceId ?? null,
        triggerType: options.triggerType ?? 'manual',
      },
      companiesAvailable: companies.length,
      sourcesAvailable: sources.length,
      patternCatalogAvailable: patternCatalog.length,
      companiesProcessed: captureResults.length,
      companiesEligibleForDerivedDecision: decisionCompanies.length,
      companiesSkippedFromDerivedDecision: Math.max(0, targetCompanies.length - decisionCompanies.length),
      outputsCollected: captureResults.reduce((sum, result) => sum + result.outputs.length, 0),
      outputsTreatmentEligible: qualityDecisionResults.reduce((sum, result) => sum + result.outputs.length, 0),
      outputsDecisionEligible: decisionCaptureResults.reduce((sum, result) => sum + result.outputs.length, 0),
      signalsCollected: captureResults.reduce((sum, result) => sum + result.signals.length, 0),
      signalsEntityRelevantForPersistence: persistenceCaptureResults.reduce((sum, result) => sum + result.signals.length, 0),
      signalsDecisionEligible: decisionCaptureResults.reduce((sum, result) => sum + result.signals.length, 0),
      enrichmentsCollected: captureResults.reduce((sum, result) => sum + result.enrichments.length, 0),
      enrichmentsEntityRelevantForPersistence: persistenceCaptureResults.reduce((sum, result) => sum + result.enrichments.length, 0),
      enrichmentsDecisionEligible: decisionCaptureResults.reduce((sum, result) => sum + result.enrichments.length, 0),
      documentsCollected: captureResults.reduce((sum, result) => sum + result.documents.length, 0),
      prePersistenceEntityGate: prePersistenceEntityGate.diagnostics,
      entityRelevanceGate: entityRelevanceGate.diagnostics,
      persisted,
      derived,
    };
  }
}
