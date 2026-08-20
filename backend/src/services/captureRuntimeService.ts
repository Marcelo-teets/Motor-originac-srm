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
    const persisted = await this.persistence.persist(captureResults, reason);
    const treatmentDecisionResults = filterCaptureResultsForDecision(captureResults, persisted.decisionGate);
    const entityRelevanceGate = filterCaptureResultsForEntityRelevance(treatmentDecisionResults, targetCompanies);
    const decisionCaptureResults = entityRelevanceGate.results;

    // Raw evidence remains broad and auditable. Decision artifacts are intentionally narrower:
    // Company Master eligibility, treatment/quality and semantic entity relevance must all pass
    // before qualification, patterns, scores, ranking inputs or pipeline can move.
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
      outputsTreatmentEligible: treatmentDecisionResults.reduce((sum, result) => sum + result.outputs.length, 0),
      outputsDecisionEligible: decisionCaptureResults.reduce((sum, result) => sum + result.outputs.length, 0),
      signalsCollected: captureResults.reduce((sum, result) => sum + result.signals.length, 0),
      signalsDecisionEligible: decisionCaptureResults.reduce((sum, result) => sum + result.signals.length, 0),
      enrichmentsCollected: captureResults.reduce((sum, result) => sum + result.enrichments.length, 0),
      enrichmentsDecisionEligible: decisionCaptureResults.reduce((sum, result) => sum + result.enrichments.length, 0),
      documentsCollected: captureResults.reduce((sum, result) => sum + result.documents.length, 0),
      entityRelevanceGate: entityRelevanceGate.diagnostics,
      persisted,
      derived,
    };
  }
}
