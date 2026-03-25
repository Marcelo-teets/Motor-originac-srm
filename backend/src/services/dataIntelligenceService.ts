import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { signalRules } from '../data/signalRules.js';
import { sourceConnectors, sourceEndpoints, type SourceEndpointDefinition } from '../data/sourceCatalog.js';

type RawDocumentInput = {
  sourceEndpointId: string;
  externalId?: string;
  canonicalUrl?: string;
  title?: string;
  publishedAt?: string;
  mimeType?: string;
  language?: string;
  rawPayload?: Record<string, unknown>;
  parsedText?: string;
  metadata?: Record<string, unknown>;
};

type CompanyFactInput = {
  companyId: string;
  rawDocumentId?: string;
  factType: string;
  factKey: string;
  factValue?: string;
  numericValue?: number;
  observedAt?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

type SignalExtractionInput = {
  companyId: string;
  rawDocumentId?: string;
  signalType: string;
  signalStrength: number;
  confidence: number;
  rationale: string;
  payload?: Record<string, unknown>;
};

const normalizeText = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const contentHash = (value: string) => createHash('sha256').update(value).digest('hex');

export class DataIntelligenceService {
  private readonly client = getSupabaseClient();

  async seedCatalog() {
    if (!this.client) return { connectors: sourceConnectors.length, endpoints: sourceEndpoints.length, mode: 'memory' };

    await this.client.upsert('connector_registry', sourceConnectors.map((item) => ({
      id: item.id,
      name: item.name,
      connector_type: item.connectorType,
      base_url: item.baseUrl,
      auth_mode: item.authMode,
      cadence: item.cadence,
      notes: item.rationale,
      updated_at: new Date().toISOString(),
    })), 'id');

    await this.client.upsert('source_endpoints', sourceEndpoints.map((item) => ({
      id: item.id,
      connector_id: item.connectorId,
      name: item.name,
      category: item.category,
      endpoint_url: item.endpointUrl,
      sector_hint: item.sectorHint ?? null,
      parser_strategy: item.parserStrategy,
      extraction_mode: item.extractionMode,
      metadata: { matchingHints: item.matchingHints },
      updated_at: new Date().toISOString(),
    })), 'id');

    return { connectors: sourceConnectors.length, endpoints: sourceEndpoints.length, mode: 'supabase' };
  }

  async listCatalog() {
    return {
      connectors: sourceConnectors,
      endpoints: sourceEndpoints,
    };
  }

  async createIngestionRun(sourceEndpointId: string, runType = 'manual') {
    const payload = {
      source_endpoint_id: sourceEndpointId,
      run_type: runType,
      status: 'running',
      started_at: new Date().toISOString(),
      metadata: {},
    };

    if (!this.client) return { id: `run_${sourceEndpointId}`, ...payload };
    const [row] = await this.client.insert('ingestion_runs', [payload]);
    return row;
  }

  async finalizeIngestionRun(runId: string, patch: {
    status: 'completed' | 'failed';
    httpStatus?: number;
    recordsSeen?: number;
    recordsInserted?: number;
    recordsUpdated?: number;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!this.client) return { id: runId, ...patch };
    await this.client.upsert('ingestion_runs', [{
      id: runId,
      status: patch.status,
      http_status: patch.httpStatus ?? null,
      records_seen: patch.recordsSeen ?? 0,
      records_inserted: patch.recordsInserted ?? 0,
      records_updated: patch.recordsUpdated ?? 0,
      error_message: patch.errorMessage ?? null,
      metadata: patch.metadata ?? {},
      finished_at: new Date().toISOString(),
    }], 'id');
    return { id: runId, ...patch };
  }

  async saveRawDocument(input: RawDocumentInput) {
    const normalizedText = input.parsedText?.trim() ?? '';
    const row = {
      source_endpoint_id: input.sourceEndpointId,
      external_id: input.externalId ?? null,
      canonical_url: input.canonicalUrl ?? null,
      title: input.title ?? null,
      published_at: input.publishedAt ?? null,
      mime_type: input.mimeType ?? 'text/html',
      language: input.language ?? 'pt-BR',
      raw_payload: input.rawPayload ?? {},
      parsed_text: normalizedText || null,
      metadata: input.metadata ?? {},
      content_hash: normalizedText ? contentHash(normalizedText) : null,
    };

    if (!this.client) return { id: `raw_${Date.now()}`, ...row };
    const [saved] = await this.client.insert('raw_documents', [row]);
    return saved;
  }

  async linkDocumentToCompany(companyId: string, rawDocumentId: string, confidence = 0.7, matchMethod = 'heuristic') {
    if (!this.client) return { company_id: companyId, raw_document_id: rawDocumentId, confidence, match_method: matchMethod };
    const [saved] = await this.client.upsert('company_source_links', [{
      company_id: companyId,
      raw_document_id: rawDocumentId,
      confidence: confidence.toFixed(4),
      match_method: matchMethod,
    }], 'company_id,raw_document_id');
    return saved;
  }

  async saveCompanyFact(input: CompanyFactInput) {
    const row = {
      company_id: input.companyId,
      raw_document_id: input.rawDocumentId ?? null,
      fact_type: input.factType,
      fact_key: input.factKey,
      fact_value: input.factValue ?? null,
      numeric_value: input.numericValue ?? null,
      observed_at: input.observedAt ?? null,
      confidence: input.confidence ?? 0.5,
      metadata: input.metadata ?? {},
    };

    if (!this.client) return { id: `fact_${Date.now()}`, ...row };
    const [saved] = await this.client.insert('company_source_facts', [row]);
    return saved;
  }

  async saveSignalExtraction(input: SignalExtractionInput) {
    const row = {
      company_id: input.companyId,
      raw_document_id: input.rawDocumentId ?? null,
      signal_type: input.signalType,
      signal_strength: input.signalStrength,
      confidence: input.confidence,
      rationale: input.rationale,
      payload: input.payload ?? {},
    };

    if (!this.client) return { id: `sig_${Date.now()}`, ...row };
    const [saved] = await this.client.insert('signal_extractions', [row]);
    return saved;
  }

  detectSignalsFromText(text: string) {
    const normalized = normalizeText(text);
    return signalRules.filter((rule) => rule.keywords.some((keyword) => normalized.includes(normalizeText(keyword))));
  }

  async enrichCompanyFromDocument(params: { companyId: string; rawDocumentId: string; text: string; title?: string }) {
    const matchedRules = this.detectSignalsFromText(params.text);
    const facts = [] as Array<ReturnType<typeof this.saveCompanyFact>>;
    const signals = [] as Array<ReturnType<typeof this.saveSignalExtraction>>;

    for (const rule of matchedRules) {
      signals.push(this.saveSignalExtraction({
        companyId: params.companyId,
        rawDocumentId: params.rawDocumentId,
        signalType: rule.signalType,
        signalStrength: rule.strength,
        confidence: rule.confidence,
        rationale: rule.rationale,
        payload: { title: params.title ?? null, category: rule.category, ruleId: rule.id },
      }));

      for (const mapping of rule.factMappings ?? []) {
        facts.push(this.saveCompanyFact({
          companyId: params.companyId,
          rawDocumentId: params.rawDocumentId,
          factType: mapping.factType,
          factKey: mapping.factKey,
          factValue: params.title ?? rule.signalType,
          confidence: rule.confidence,
          metadata: { ruleId: rule.id },
        }));
      }
    }

    const settledFacts = await Promise.all(facts);
    const settledSignals = await Promise.all(signals);

    if (this.client) {
      await this.client.insert('enrichment_snapshots', [{
        company_id: params.companyId,
        snapshot_type: 'document_enrichment',
        source_count: 1,
        fact_count: settledFacts.length,
        confidence: matchedRules.length ? Math.max(...matchedRules.map((rule) => rule.confidence)) : 0.5,
        payload: {
          rawDocumentId: params.rawDocumentId,
          matchedRules: matchedRules.map((rule) => rule.id),
          title: params.title ?? null,
        },
      }]).catch(() => undefined);
    }

    return {
      matchedRules: matchedRules.map((rule) => rule.id),
      facts: settledFacts,
      signals: settledSignals,
    };
  }

  async createCompanyAlias(companyId: string, alias: string, aliasType = 'brand') {
    if (!this.client) return { company_id: companyId, alias, alias_type: aliasType };
    const [saved] = await this.client.upsert('company_aliases', [{
      company_id: companyId,
      alias,
      alias_type: aliasType,
    }], 'company_id,alias');
    return saved;
  }

  getSourceEndpointById(id: string): SourceEndpointDefinition | undefined {
    return sourceEndpoints.find((endpoint) => endpoint.id === id);
  }
}
