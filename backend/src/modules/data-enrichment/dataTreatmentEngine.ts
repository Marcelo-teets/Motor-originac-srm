import type { CompanySeed, MonitoringOutput } from '../../types/platform.js';
import type { EnrichmentRunInput, EnrichmentRunOutput, AliasRecord, OutputLifecycleState, RecaptureTask } from './types.js';

const STALE_WINDOW_DAYS = 14;
const FORGET_WINDOW_DAYS = 45;
const ARCHIVE_WINDOW_DAYS = 90;
const LOW_CONFIDENCE_THRESHOLD = 0.65;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const uniq = <T>(values: T[]) => [...new Set(values)];

const ageInDays = (isoDate: string) => {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  return Number.isNaN(diffMs) ? 999 : diffMs / (1000 * 60 * 60 * 24);
};

const normalizeDomain = (website: string) => website.replace(/^https?:\/\//, '').replace(/\/$/, '').trim().toLowerCase();

const buildAliases = (company: CompanySeed): AliasRecord[] => {
  const aliases: AliasRecord[] = [];
  if (company.legalName) aliases.push({ companyId: company.id, aliasType: 'legal_name', aliasValue: company.legalName, confidenceScore: 0.95 });
  if (company.tradeName) aliases.push({ companyId: company.id, aliasType: 'trade_name', aliasValue: company.tradeName, confidenceScore: 0.92 });
  if (company.website) aliases.push({ companyId: company.id, aliasType: 'domain', aliasValue: normalizeDomain(company.website), confidenceScore: 0.9 });
  return aliases;
};

const detectThemes = (outputs: MonitoringOutput[]) => {
  const texts = outputs.map((item) => `${item.title} ${item.summary}`.toLowerCase());
  const themes: string[] = [];
  if (texts.some((text) => /fidc|funding|capital|deb[êe]nture/.test(text))) themes.push('capital_structure');
  if (texts.some((text) => /receb[ií]veis|antecip|cart[ãa]o/.test(text))) themes.push('receivables_strength');
  if (texts.some((text) => /expans|crescimento|nova regi|novo canal/.test(text))) themes.push('expansion');
  if (texts.some((text) => /inadimpl|provis|risc|chargeback/.test(text))) themes.push('risk_signal');
  return uniq(themes);
};

const lifecycleForOutput = (output: MonitoringOutput): OutputLifecycleState => {
  const age = ageInDays(output.collectedAt);

  if (age > ARCHIVE_WINDOW_DAYS) return 'archived';
  if (age > FORGET_WINDOW_DAYS && output.confidenceScore < LOW_CONFIDENCE_THRESHOLD) return 'forgotten';
  if (age > STALE_WINDOW_DAYS) return 'stale';
  if (output.confidenceScore < LOW_CONFIDENCE_THRESHOLD) return 'review';
  return 'active';
};

const recapturePriority = (output: MonitoringOutput, lifecycle: OutputLifecycleState): RecaptureTask['priority'] => {
  if (lifecycle === 'review' && output.confidenceScore < 0.45) return 'urgent';
  if (lifecycle === 'stale' || lifecycle === 'review') return 'high';
  return 'normal';
};

const buildRecaptureQueue = (outputs: MonitoringOutput[], lifecycleMap: Map<string, OutputLifecycleState>): RecaptureTask[] =>
  outputs
    .filter((output) => {
      const state = lifecycleMap.get(output.id) ?? 'active';
      return state === 'review' || state === 'stale';
    })
    .map((output) => {
      const lifecycle = lifecycleMap.get(output.id) ?? 'active';
      return {
        outputId: output.id,
        sourceId: output.sourceId,
        priority: recapturePriority(output, lifecycle),
        reason: lifecycle === 'stale' ? 'output_stale_requires_refresh' : 'low_confidence_requires_corroboration',
      } satisfies RecaptureTask;
    })
    .sort((a, b) => {
      const order = { urgent: 0, high: 1, normal: 2 };
      return order[a.priority] - order[b.priority];
    })
    .slice(0, 10);

const calculateQualityScore = (outputs: MonitoringOutput[], lifecycleMap: Map<string, OutputLifecycleState>) => {
  if (!outputs.length) return 0;

  const confidenceScore = outputs.reduce((sum, item) => sum + item.confidenceScore, 0) / outputs.length;
  const freshnessScore = outputs.filter((item) => {
    const lifecycle = lifecycleMap.get(item.id) ?? 'active';
    return lifecycle === 'active' || lifecycle === 'review';
  }).length / outputs.length;
  const coverageScore = uniq(outputs.map((item) => item.sourceId)).length / 5;

  return clamp((confidenceScore * 0.5) + (freshnessScore * 0.35) + (clamp(coverageScore) * 0.15));
};

const calculateRecapturePressure = (queue: RecaptureTask[], outputsConsidered: number) => {
  if (!outputsConsidered) return 0;
  const weighted = queue.reduce((sum, item) => {
    if (item.priority === 'urgent') return sum + 1;
    if (item.priority === 'high') return sum + 0.7;
    return sum + 0.4;
  }, 0);
  return clamp(weighted / outputsConsidered);
};

const buildHealthAlerts = (params: {
  qualityScore: number;
  staleOutputs: number;
  forgottenOutputs: number;
  sourceCoverage: number;
  outputsConsidered: number;
  recapturePressure: number;
}): string[] => {
  const alerts: string[] = [];
  if (params.qualityScore < 0.45) alerts.push('quality_score_critical');
  if (params.outputsConsidered > 0 && (params.staleOutputs / params.outputsConsidered) > 0.45) alerts.push('stale_ratio_high');
  if (params.forgottenOutputs > 5) alerts.push('forgotten_volume_elevated');
  if (params.sourceCoverage <= 1 && params.outputsConsidered > 0) alerts.push('source_coverage_low');
  if (params.recapturePressure > 0.6) alerts.push('recapture_pressure_high');
  return alerts;
};

export class DataTreatmentEngine {
  run(input: EnrichmentRunInput, companies: CompanySeed[], monitoringOutputs: MonitoringOutput[]): EnrichmentRunOutput[] {
    const targets = input.companyId ? companies.filter((item) => item.id === input.companyId) : companies;

    return targets.map((company) => {
      const companyOutputs = monitoringOutputs.filter((item) => item.companyId === company.id);
      const lifecycleMap = new Map(companyOutputs.map((output) => [output.id, lifecycleForOutput(output)]));

      const lifecycleCounts: Record<OutputLifecycleState, number> = {
        active: 0,
        review: 0,
        stale: 0,
        forgotten: 0,
        archived: 0,
      };

      lifecycleMap.forEach((state) => {
        lifecycleCounts[state] += 1;
      });

      const actionableOutputs = companyOutputs.filter((item) => {
        const state = lifecycleMap.get(item.id) ?? 'active';
        return state !== 'forgotten' && state !== 'archived';
      });

      const recaptureQueue = buildRecaptureQueue(actionableOutputs, lifecycleMap);
      const requestsCreated = recaptureQueue.length;
      const staleOutputs = lifecycleCounts.stale;
      const forgottenOutputs = lifecycleCounts.forgotten;
      const inferredThemes = detectThemes(actionableOutputs);
      const sourceCoverage = uniq(actionableOutputs.map((item) => item.sourceId)).length;
      const qualityScore = calculateQualityScore(actionableOutputs, lifecycleMap);
      const recapturePressure = calculateRecapturePressure(recaptureQueue, companyOutputs.length);
      const healthAlerts = buildHealthAlerts({
        qualityScore,
        staleOutputs,
        forgottenOutputs,
        sourceCoverage,
        outputsConsidered: companyOutputs.length,
        recapturePressure,
      });

      return {
        companyId: company.id,
        aliases: buildAliases(company),
        requestsCreated,
        outputsConsidered: companyOutputs.length,
        staleOutputs,
        forgottenOutputs,
        qualityScore,
        sourceCoverage,
        lifecycleCounts,
        recaptureQueue,
        inferredThemes,
        recapturePressure,
        healthAlerts,
      } satisfies EnrichmentRunOutput;
    });
  }
}
