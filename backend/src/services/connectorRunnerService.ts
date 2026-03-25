import { ConnectorCacheService } from './connectorCacheService.js';
import { ContentParsingService } from './contentParsingService.js';
import { DataIntelligenceService } from './dataIntelligenceService.js';
import { sourceEndpoints, type SourceEndpointDefinition } from '../data/sourceCatalog.js';

type RunnerResult = {
  sourceEndpointId: string;
  mode: 'api' | 'feed' | 'crawl';
  simulated: boolean;
  documentsCreated: number;
  matchedRules: string[];
};

const samplePayloadByEndpoint = (endpoint: SourceEndpointDefinition) => {
  if (endpoint.parserStrategy === 'json') {
    return {
      nome: 'Empresa Exemplo Crédito Tech',
      razao_social: 'Empresa Exemplo Crédito Tech S.A.',
      cnpj: '12345678000199',
      cnae_principal: '6201501',
      title: 'Empresa com operação de antecipação e crédito embutido',
      updated_at: new Date().toISOString(),
    };
  }

  if (endpoint.parserStrategy === 'rss') {
    return `
      <rss><channel>
        <item>
          <title>Fintech brasileira capta rodada para expansão de crédito</title>
          <description>Empresa acelera expansão, reforça embedded finance e estrutura de recebíveis.</description>
          <pubDate>${new Date().toUTCString()}</pubDate>
          <link>${endpoint.endpointUrl}</link>
        </item>
      </channel></rss>
    `;
  }

  return `
    <html>
      <head>
        <title>Crédito, recebíveis e expansão</title>
        <meta property="article:published_time" content="${new Date().toISOString()}" />
      </head>
      <body>
        <h1>Antecipação de recebíveis e capital de giro</h1>
        <p>A companhia expande a operação e reforça oferta de crédito para clientes.</p>
      </body>
    </html>
  `;
};

export class ConnectorRunnerService {
  private readonly parsingService = new ContentParsingService();
  private readonly dataService = new DataIntelligenceService();
  private readonly cacheService = new ConnectorCacheService();

  async runEndpoint(sourceEndpointId: string, companyId?: string): Promise<RunnerResult> {
    const endpoint = sourceEndpoints.find((item) => item.id === sourceEndpointId);
    if (!endpoint) throw new Error(`Endpoint not found: ${sourceEndpointId}`);

    const cacheKey = companyId ? `${sourceEndpointId}:${companyId}` : `${sourceEndpointId}:global`;
    const cached = await this.cacheService.get(sourceEndpointId, cacheKey);
    const payload = (cached?.payload as Record<string, unknown> | undefined) ?? samplePayloadByEndpoint(endpoint);

    if (!cached && typeof payload === 'object' && payload) {
      await this.cacheService.set(sourceEndpointId, cacheKey, payload as Record<string, unknown>, 12).catch(() => undefined);
    }

    const parsedItems = this.parsingService.parseByStrategy(endpoint.parserStrategy, payload as string | Record<string, unknown>);
    const matchedRules = new Set<string>();
    let documentsCreated = 0;

    for (const parsed of parsedItems) {
      const rawDocument = await this.dataService.saveRawDocument({
        sourceEndpointId,
        canonicalUrl: endpoint.endpointUrl,
        title: parsed.title,
        publishedAt: parsed.publishedAt,
        parsedText: parsed.text,
        rawPayload: typeof payload === 'object' && payload ? payload as Record<string, unknown> : { raw: payload },
        metadata: parsed.metadata,
      });

      documentsCreated += 1;

      if (companyId) {
        await this.dataService.linkDocumentToCompany(companyId, String(rawDocument.id), 0.75, 'runner');
        const enrichment = await this.dataService.enrichCompanyFromDocument({
          companyId,
          rawDocumentId: String(rawDocument.id),
          text: parsed.text,
          title: parsed.title,
        });
        enrichment.matchedRules.forEach((ruleId) => matchedRules.add(ruleId));
      }
    }

    return {
      sourceEndpointId,
      mode: endpoint.extractionMode,
      simulated: !cached,
      documentsCreated,
      matchedRules: [...matchedRules],
    };
  }

  async runCatalogBootstrap(companyId?: string) {
    const results: RunnerResult[] = [];
    for (const endpoint of sourceEndpoints) {
      results.push(await this.runEndpoint(endpoint.id, companyId));
    }
    return results;
  }
}
