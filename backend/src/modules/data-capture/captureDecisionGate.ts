import type { CompanySignal, EnrichmentRecord } from '../../types/platform.js';
import type { CaptureEngineResult, TreatmentDecisionGate } from './types.js';

const pairKey = (companyId?: string | null, sourceId?: string | null) => `${companyId ?? ''}|${sourceId ?? ''}`;
const stringValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const stringArray = (value: unknown) => Array.isArray(value)
  ? value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item))
  : [];

const signalOutputIds = (signal: CompanySignal) => {
  const exact = stringValue(signal.evidencePayload?.outputId);
  const many = stringArray(signal.evidencePayload?.outputIds);
  return [...new Set([...(exact ? [exact] : []), ...many])];
};

const enrichmentOutputIds = (enrichment: EnrichmentRecord) => {
  const direct = stringArray(enrichment.payload?.outputIds);
  const outputs = Array.isArray(enrichment.payload?.outputs)
    ? enrichment.payload.outputs.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const id = stringValue((item as Record<string, unknown>).outputId);
        return id ? [id] : [];
      })
    : [];
  return [...new Set([...direct, ...outputs])];
};

const sourceIdFromEnrichment = (enrichment: EnrichmentRecord) => stringValue(enrichment.payload?.sourceId);
const allReferencedOutputsEligible = (outputIds: string[], eligible: Set<string>) =>
  outputIds.length > 0 && outputIds.every((outputId) => eligible.has(outputId));

const companySourceAllowed = (
  companyId: string,
  sourceId: string | undefined,
  allowedPairs: Set<string>,
  blockedPairs: Set<string>,
) => {
  if (!sourceId) return false;
  const key = pairKey(companyId, sourceId);
  return allowedPairs.has(key) && !blockedPairs.has(key);
};

const signalEligible = (
  signal: CompanySignal,
  eligibleOutputs: Set<string>,
  allowedPairs: Set<string>,
  blockedPairs: Set<string>,
) => {
  const outputIds = signalOutputIds(signal);
  if (outputIds.length) return allReferencedOutputsEligible(outputIds, eligibleOutputs);
  return companySourceAllowed(signal.companyId, signal.sourceId, allowedPairs, blockedPairs);
};

const enrichmentEligible = (
  enrichment: EnrichmentRecord,
  eligibleOutputs: Set<string>,
  allowedPairs: Set<string>,
  blockedPairs: Set<string>,
) => {
  const outputIds = enrichmentOutputIds(enrichment);
  if (outputIds.length) return allReferencedOutputsEligible(outputIds, eligibleOutputs);
  return companySourceAllowed(enrichment.companyId, sourceIdFromEnrichment(enrichment), allowedPairs, blockedPairs);
};

export const filterCaptureResultsForDecision = (
  results: CaptureEngineResult[],
  gate: TreatmentDecisionGate,
): CaptureEngineResult[] => {
  const eligibleOutputs = new Set(gate.eligibleOutputIds);
  const allowedPairs = new Set(gate.allowedCompanySourcePairs);
  const blockedPairs = new Set(gate.blockedCompanySourcePairs);

  return results.map((result) => {
    const outputs = result.outputs.filter((output) => eligibleOutputs.has(output.id));
    const documents = result.documents.filter((document) => document.monitoringOutputId && eligibleOutputs.has(document.monitoringOutputId));
    const treatmentResults = result.treatmentResults.filter((treatment) => eligibleOutputs.has(treatment.outputId));
    const signals = result.signals.filter((signal) => signalEligible(signal, eligibleOutputs, allowedPairs, blockedPairs));
    const enrichments = result.enrichments.filter((enrichment) => enrichmentEligible(enrichment, eligibleOutputs, allowedPairs, blockedPairs));

    return {
      ...result,
      run: {
        ...result.run,
        outputsWritten: outputs.length,
        signalsWritten: signals.length,
        enrichmentsWritten: enrichments.length,
      },
      outputs,
      documents,
      treatmentResults,
      signals,
      enrichments,
    };
  });
};
