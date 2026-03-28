import type { CompanySeed, SourceCatalogEntry } from '../../types/platform.js';
import { ingestCompanyMonitoring } from '../../lib/connectors.js';
import type { CaptureEngineResult, CaptureRunRequest, CanonicalSourceDocument } from './types.js';

const toCanonicalDocuments = (
  companyId: string,
  outputs: CaptureEngineResult['outputs'],
): CanonicalSourceDocument[] =>
  outputs.map((output) => ({
    id: `doc_${output.id}`,
    companyId,
    sourceId: output.sourceId,
    documentType: 'monitoring_output',
    canonicalUrl: String((output.normalizedPayload as Record<string, unknown>)?.sourceUrl ?? ''),
    title: output.title,
    observedAt: output.collectedAt,
    contentHash: `${output.companyId}_${output.sourceId}_${output.collectedAt}`,
    rawPayload: output.normalizedPayload,
    normalizedPayload: output.normalizedPayload,
    extractionStatus: 'normalized',
    confidenceScore: output.confidenceScore,
  }));

export class DataCaptureEngine {
  async run(request: CaptureRunRequest, companies: CompanySeed[], sources: SourceCatalogEntry[]): Promise<CaptureEngineResult[]> {
    const targetCompanies = request.companyId ? companies.filter((item) => item.id === request.companyId) : companies;

    return Promise.all(targetCompanies.map(async (company) => {
      const result = await ingestCompanyMonitoring(company, sources);
      return {
        run: {
          scopeType: request.scopeType,
          triggerType: request.triggerType,
          companyId: company.id,
          sourceId: request.sourceId,
          status: result.outputs.some((item) => item.connectorStatus !== 'real') ? 'partial' : 'completed',
          itemsCollected: result.outputs.length,
          outputsWritten: result.outputs.length,
          signalsWritten: result.signals.length,
          enrichmentsWritten: result.enrichments.length,
        },
        documents: toCanonicalDocuments(company.id, result.outputs),
        outputs: result.outputs,
        signals: result.signals,
        enrichments: result.enrichments,
      } satisfies CaptureEngineResult;
    }));
  }
}
