import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../../types/platform.js';
import { ingestCompanyMonitoring } from '../../lib/connectors.js';
import type { CaptureEngineResult, CaptureRunRequest, CanonicalSourceDocument } from './types.js';

const SOURCE_CONFIDENCE_BONUS: Record<string, number> = {
  src_brasilapi_cnpj: 0.1,
  src_company_website: 0.06,
  src_cvm_rss: 0.08,
  src_google_news_rss: 0.03,
  src_valor_rss: 0.04,
};

const THEME_RULES = [
  { theme: 'capital_structure', pattern: /fidc|capta|funding|deb[êe]nture|capital/i },
  { theme: 'receivables_strength', pattern: /receb[ií]veis|antecip|cart[ãa]o/i },
  { theme: 'expansion', pattern: /expans|crescimento|nova regi|novo canal/i },
  { theme: 'risk_signal', pattern: /inadimpl|provis|chargeback|risc|default/i },
] as const;

const clamp = (value: number, min = 0.12, max = 0.99) => Math.min(max, Math.max(min, value));

const agePenalty = (isoDate: string) => {
  const ageDays = (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
  if (Number.isNaN(ageDays)) return -0.06;
  if (ageDays <= 2) return 0.05;
  if (ageDays <= 7) return 0.02;
  if (ageDays <= 14) return 0;
  if (ageDays <= 30) return -0.05;
  return -0.12;
};

const normalizeUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'].forEach((param) => parsed.searchParams.delete(param));
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return url.trim();
  }
};

const dedupeOutputs = (outputs: MonitoringOutput[]): { deduped: MonitoringOutput[]; duplicatesDiscarded: number } => {
  const seen = new Set<string>();
  const deduped = outputs.filter((output) => {
    const payload = output.normalizedPayload as Record<string, unknown>;
    const sourceUrl = typeof payload.sourceUrl === 'string' ? normalizeUrl(payload.sourceUrl) : '';
    const key = `${output.sourceId}|${output.title.trim().toLowerCase()}|${sourceUrl}|${output.summary.slice(0, 80).trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { deduped, duplicatesDiscarded: outputs.length - deduped.length };
};

const dedupeSignals = (signals: CompanySignal[]): CompanySignal[] => {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.companyId}|${signal.sourceId ?? ''}|${signal.signalType}|${String(signal.evidencePayload?.theme ?? signal.evidencePayload?.note ?? '').slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const dedupeEnrichments = (enrichments: EnrichmentRecord[]): EnrichmentRecord[] => {
  const seen = new Set<string>();
  return enrichments.filter((enrichment) => {
    const key = `${enrichment.companyId}|${enrichment.enrichmentType}|${enrichment.provider ?? ''}|${String(enrichment.payload?.summary ?? '').slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const calibrateConfidence = (output: MonitoringOutput): number => {
  const payload = output.normalizedPayload as Record<string, unknown>;
  const publishedAt = typeof payload.timestamp === 'string' ? payload.timestamp : output.collectedAt;
  const hasSummary = output.summary.trim().length > 50;
  const hasSourceUrl = typeof payload.sourceUrl === 'string' || typeof payload.endpoint === 'string';
  const completeness = (hasSummary ? 0.04 : -0.05) + (hasSourceUrl ? 0.02 : -0.04);
  const statusPenalty = output.connectorStatus === 'real' ? 0.03 : -0.18;
  const sourceBonus = SOURCE_CONFIDENCE_BONUS[output.sourceId] ?? 0;

  return clamp(output.confidenceScore + statusPenalty + completeness + sourceBonus + agePenalty(publishedAt));
};

const toCanonicalDocuments = (companyId: string, outputs: MonitoringOutput[]): CanonicalSourceDocument[] =>
  outputs.map((output) => {
    const payload = output.normalizedPayload as Record<string, unknown>;
    const canonicalUrl = normalizeUrl(String(payload?.sourceUrl ?? payload?.endpoint ?? ''));

    return {
      id: `doc_${output.id}`,
      companyId,
      sourceId: output.sourceId,
      documentType: 'monitoring_output',
      canonicalUrl,
      title: output.title,
      observedAt: output.collectedAt,
      contentHash: `${output.companyId}_${output.sourceId}_${output.collectedAt}_${output.title}_${output.summary.slice(0, 60)}`,
      rawPayload: output.normalizedPayload,
      normalizedPayload: { ...output.normalizedPayload, canonicalUrl },
      extractionStatus: 'normalized',
      confidenceScore: output.confidenceScore,
    };
  });

const extractThemes = (outputs: MonitoringOutput[]) => {
  const map = new Map<string, Set<string>>();
  outputs.forEach((output) => {
    const text = `${output.title} ${output.summary}`;
    THEME_RULES.forEach(({ theme, pattern }) => {
      if (!pattern.test(text)) return;
      const sources = map.get(theme) ?? new Set<string>();
      sources.add(output.sourceId);
      map.set(theme, sources);
    });
  });
  return [...map.entries()]
    .filter(([, sources]) => sources.size >= 2)
    .map(([theme]) => theme);
};

const buildCrossSignals = (company: CompanySeed, themes: string[], collectedAt: string): CompanySignal[] =>
  themes.map((theme) => ({
    id: `${company.id}_cross_${theme}_${collectedAt}`,
    companyId: company.id,
    sourceId: 'cross_source',
    signalType: `cross_${theme}`,
    signalStrength: 84,
    confidenceScore: 0.86,
    evidencePayload: { theme, corroboration: 'multi_source', createdAt: collectedAt },
    observedVsInferred: 'inferred',
    createdAt: collectedAt,
  }));

const buildCrossEnrichment = (company: CompanySeed, themes: string[], collectedAt: string): EnrichmentRecord[] => {
  if (!themes.length) return [];
  return [{
    id: `${company.id}_cross_enrichment_${collectedAt}`,
    companyId: company.id,
    enrichmentType: 'cross_source_corroboration',
    provider: 'data_capture_engine',
    payload: {
      themes,
      summary: `Corroboração multi-fonte identificada para: ${themes.join(', ')}`,
      confidenceModelVersion: 'v2.1',
      collectedAt,
    },
    observedVsInferred: 'inferred',
    createdAt: collectedAt,
  }];
};

const filterByRequestedSource = (request: CaptureRunRequest, outputs: MonitoringOutput[], signals: CompanySignal[], enrichments: EnrichmentRecord[]) => {
  if (!request.sourceId) return { outputs, signals, enrichments };

  return {
    outputs: outputs.filter((item) => item.sourceId === request.sourceId),
    signals: signals.filter((item) => item.sourceId === request.sourceId),
    enrichments: request.sourceId === 'src_brasilapi_cnpj' ? enrichments : [],
  };
};

export class DataCaptureEngine {
  async run(request: CaptureRunRequest, companies: CompanySeed[], sources: SourceCatalogEntry[]): Promise<CaptureEngineResult[]> {
    const targetCompanies = request.companyId ? companies.filter((item) => item.id === request.companyId) : companies;
    const targetSources = request.sourceId ? sources.filter((item) => item.id === request.sourceId) : sources;

    return Promise.all(targetCompanies.map(async (company) => {
      const collectedAt = new Date().toISOString();
      const ingested = await ingestCompanyMonitoring(company, targetSources);
      const filtered = filterByRequestedSource(request, ingested.outputs, ingested.signals, ingested.enrichments);
      const { deduped, duplicatesDiscarded } = dedupeOutputs(filtered.outputs);

      const outputs = deduped
        .map((output) => ({ ...output, confidenceScore: calibrateConfidence(output) }))
        .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));

      const corroboratedThemes = extractThemes(outputs);
      const crossSignals = buildCrossSignals(company, corroboratedThemes, collectedAt);
      const crossEnrichments = buildCrossEnrichment(company, corroboratedThemes, collectedAt);
      const allSignals = dedupeSignals([...filtered.signals, ...crossSignals]);
      const allEnrichments = dedupeEnrichments([...filtered.enrichments, ...crossEnrichments]);

      const runStatus = outputs.length === 0
        ? 'failed'
        : outputs.some((item) => item.connectorStatus !== 'real')
          ? 'partial'
          : 'completed';

      return {
        run: {
          scopeType: request.scopeType,
          triggerType: request.triggerType,
          companyId: company.id,
          sourceId: request.sourceId,
          status: runStatus,
          itemsCollected: outputs.length,
          outputsWritten: outputs.length,
          signalsWritten: allSignals.length,
          enrichmentsWritten: allEnrichments.length,
          diagnostics: {
            sourcesObserved: new Set(outputs.map((item) => item.sourceId)).size,
            duplicatesDiscarded,
            partialConnectors: outputs.filter((item) => item.connectorStatus !== 'real').length,
            corroboratedThemes,
            averageConfidence: outputs.length
              ? Number((outputs.reduce((sum, item) => sum + item.confidenceScore, 0) / outputs.length).toFixed(4))
              : 0,
          },
        },
        documents: toCanonicalDocuments(company.id, outputs),
        outputs,
        signals: allSignals,
        enrichments: allEnrichments,
      } satisfies CaptureEngineResult;
    }));
  }
}
