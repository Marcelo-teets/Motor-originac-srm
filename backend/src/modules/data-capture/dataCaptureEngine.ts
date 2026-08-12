import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../../types/platform.js';
import { ingestCompanyMonitoring } from '../../lib/connectors.js';
import { captureMaisRetorno } from '../../lib/maisRetornoCapture.js';
import { captureOriginationScrapers } from '../../lib/scrapers/originationScraperCapture.js';
import { captureFidcPublicData } from '../../lib/fidcPublicDataCapture.js';
import { captureBcbSgsMacro } from '../../lib/bcbSgsCapture.js';
import { capturePublicRecords } from '../../lib/publicRecordsCapture.js';
import { captureVcPortfolios } from '../../lib/vcPortfolioCapture.js';
import { captureOpenFinanceParticipation } from '../../lib/openFinanceCapture.js';
import type { CaptureEngineResult, CaptureRunRequest, CanonicalSourceDocument } from './types.js';
import { treatCaptureOutputs } from './captureTreatment.js';

const SOURCE_CONFIDENCE_BONUS: Record<string, number> = {
  src_brasilapi_cnpj: 0.1,
  src_company_website: 0.06,
  src_cvm_rss: 0.08,
  src_google_news_rss: 0.03,
  src_valor_rss: 0.04,
  src_mais_retorno_api: 0.02,
  src_company_website_deep: 0.06,
  src_professional_network_company: 0.03,
  src_cvm_fidc_monthly: 0.08,
  src_bcb_sgs: 0.08,
  src_pncp_contracts_api: 0.07,
  src_querido_diario_api: 0.05,
  src_vc_portfolio_monitor: 0.05,
  src_open_finance_participants_api: 0.08,
};

const THEME_RULES = [
  { theme: 'capital_structure', pattern: /fidc|capta|funding|deb[êe]nture|capital/i },
  { theme: 'receivables_strength', pattern: /receb[ií]veis|antecip|cart[ãa]o/i },
  { theme: 'expansion', pattern: /expans|crescimento|nova regi|novo canal/i },
  { theme: 'risk_signal', pattern: /inadimpl|provis|chargeback|risc|default/i },
  { theme: 'market_data_context', pattern: /mais retorno|fundos|indices|índices|acoes|ações|fiis|tesouro direto|comparáveis/i },
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

const sourceCodeFor = (output: MonitoringOutput) => {
  const sourceCode = output.normalizedPayload?.sourceCode;
  return typeof sourceCode === 'string' && sourceCode.trim() ? sourceCode : output.sourceId;
};

const enrichmentSourceId = (enrichment: EnrichmentRecord) => {
  const value = enrichment.payload?.sourceId;
  return typeof value === 'string' && value.trim() ? value : undefined;
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
    const key = `${enrichment.companyId}|${enrichment.enrichmentType}|${enrichment.provider ?? ''}|${String(enrichment.payload?.summary ?? enrichment.payload?.treatmentVersion ?? '').slice(0, 80)}`;
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
  const sourceBonus = SOURCE_CONFIDENCE_BONUS[sourceCodeFor(output)] ?? 0;

  return clamp(output.confidenceScore + statusPenalty + completeness + sourceBonus + agePenalty(publishedAt));
};

const toCanonicalDocuments = (companyId: string, outputs: MonitoringOutput[]): CanonicalSourceDocument[] =>
  outputs.map((output) => {
    const payload = output.normalizedPayload as Record<string, unknown>;
    const canonicalUrl = normalizeUrl(String(payload?.sourceUrl ?? payload?.canonicalUrl ?? payload?.endpoint ?? ''));
    const contentHash = `${output.companyId}_${output.sourceId}_${output.collectedAt}_${output.title}_${output.summary.slice(0, 60)}`;

    return {
      id: `doc_${output.id}`,
      monitoringOutputId: output.id,
      companyId,
      sourceId: output.sourceId,
      documentType: 'monitoring_output',
      canonicalUrl,
      title: output.title,
      observedAt: output.collectedAt,
      contentHash,
      rawPayload: output.normalizedPayload,
      normalizedPayload: { ...output.normalizedPayload, canonicalUrl, monitoringOutputId: output.id },
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

const buildCrossSignals = (company: CompanySeed, themes: string[], outputs: MonitoringOutput[], collectedAt: string): CompanySignal[] =>
  themes.map((theme) => ({
    id: crypto.randomUUID(),
    companyId: company.id,
    signalType: `cross_${theme}`,
    signalStrength: 84,
    confidenceScore: 0.86,
    evidencePayload: {
      theme,
      corroboration: 'multi_source',
      outputIds: outputs.filter((output) => THEME_RULES.some((rule) => rule.theme === theme && rule.pattern.test(`${output.title} ${output.summary}`))).map((output) => output.id),
      createdAt: collectedAt,
    },
    observedVsInferred: 'inferred',
    createdAt: collectedAt,
  }));

const buildCrossEnrichment = (company: CompanySeed, themes: string[], outputs: MonitoringOutput[], collectedAt: string): EnrichmentRecord[] => {
  if (!themes.length) return [];
  return [{
    id: crypto.randomUUID(),
    companyId: company.id,
    enrichmentType: 'cross_source_corroboration',
    provider: 'data_capture_engine',
    payload: {
      themes,
      outputIds: outputs.map((output) => output.id),
      summary: `Corroboração multi-fonte identificada para: ${themes.join(', ')}`,
      confidenceModelVersion: 'v2.2',
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
    enrichments: enrichments.filter((item) => enrichmentSourceId(item) === request.sourceId),
  };
};

export class DataCaptureEngine {
  async run(request: CaptureRunRequest, companies: CompanySeed[], sources: SourceCatalogEntry[]): Promise<CaptureEngineResult[]> {
    const targetCompanies = request.companyId ? companies.filter((item) => item.id === request.companyId) : companies;
    const targetSources = request.sourceId ? sources.filter((item) => item.id === request.sourceId) : sources;

    return Promise.all(targetCompanies.map(async (company) => {
      const collectedAt = new Date().toISOString();
      const [ingested, maisRetorno, scraperPacks, fidcPublic, bcbMacro, publicRecords, vcPortfolios, openFinance] = await Promise.all([
        ingestCompanyMonitoring(company, targetSources),
        captureMaisRetorno(company, targetSources, collectedAt),
        captureOriginationScrapers(company, targetSources, collectedAt),
        captureFidcPublicData(company, targetSources, collectedAt),
        captureBcbSgsMacro(company, targetSources, collectedAt),
        capturePublicRecords(company, targetSources, collectedAt),
        captureVcPortfolios(company, targetSources, collectedAt),
        captureOpenFinanceParticipation(company, targetSources, collectedAt),
      ]);
      const combined = {
        outputs: [...ingested.outputs, ...maisRetorno.outputs, ...scraperPacks.outputs, ...fidcPublic.outputs, ...bcbMacro.outputs, ...publicRecords.outputs, ...vcPortfolios.outputs, ...openFinance.outputs],
        signals: [...ingested.signals, ...maisRetorno.signals, ...scraperPacks.signals, ...fidcPublic.signals, ...bcbMacro.signals, ...publicRecords.signals, ...vcPortfolios.signals, ...openFinance.signals],
        enrichments: [...ingested.enrichments, ...maisRetorno.enrichments, ...scraperPacks.enrichments, ...fidcPublic.enrichments, ...bcbMacro.enrichments, ...publicRecords.enrichments, ...vcPortfolios.enrichments, ...openFinance.enrichments],
      };
      const filtered = filterByRequestedSource(request, combined.outputs, combined.signals, combined.enrichments);
      const { deduped, duplicatesDiscarded } = dedupeOutputs(filtered.outputs);

      const calibratedOutputs = deduped
        .map((output) => ({ ...output, confidenceScore: calibrateConfidence(output) }))
        .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));

      const treatment = treatCaptureOutputs(company, calibratedOutputs, collectedAt);
      const outputs = treatment.outputs.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
      const decisionEligibleOutputIds = new Set(treatment.treatmentResults
        .filter((item) => item.intrinsicDecisionEligible)
        .map((item) => item.outputId));
      const intelligenceEligibleOutputs = outputs.filter((output) => decisionEligibleOutputIds.has(output.id));
      const corroboratedThemes = extractThemes(intelligenceEligibleOutputs);
      const crossSignals = buildCrossSignals(company, corroboratedThemes, intelligenceEligibleOutputs, collectedAt);
      const crossEnrichments = buildCrossEnrichment(company, corroboratedThemes, intelligenceEligibleOutputs, collectedAt);
      const allSignals = dedupeSignals([...filtered.signals, ...treatment.signals, ...crossSignals]);
      const allEnrichments = dedupeEnrichments([...filtered.enrichments, ...treatment.enrichments, ...crossEnrichments]);

      const runStatus = outputs.some((item) => item.connectorStatus !== 'real')
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
            treatment: treatment.diagnostics,
          },
        },
        documents: toCanonicalDocuments(company.id, outputs),
        outputs,
        signals: allSignals,
        enrichments: allEnrichments,
        treatmentResults: treatment.treatmentResults,
      } satisfies CaptureEngineResult;
    }));
  }
}
