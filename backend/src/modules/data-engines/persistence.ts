import { getSupabaseClient } from '../../lib/supabase.js';
import type { AliasRecord } from '../data-enrichment/types.js';
import type { CaptureEngineResult } from '../data-capture/types.js';
import type { EngineRequestRecord } from '../engine-orchestration/types.js';
import { classifyImprovementMode } from '../self-improvement/policy.js';

type LearningEventInput = {
  engineName: 'data_capture_engine' | 'data_enrichment_engine';
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  summary: string;
  companyId?: string;
  sourceId?: string;
  payload?: Record<string, unknown>;
};

type ImprovementProposalInput = {
  engineName: 'data_capture_engine' | 'data_enrichment_engine';
  proposalType: string;
  title: string;
  rationale?: string;
  targetModule: string;
  riskLevel?: 'low' | 'medium' | 'high';
  proposalPayload?: Record<string, unknown>;
};

export class DataEnginesPersistence {
  private readonly client = getSupabaseClient();

  async saveCaptureArtifacts(results: CaptureEngineResult[]) {
    if (!this.client || !results.length) return;

    await this.client.insert('source_connector_runs', results.map((result) => ({
      company_id: result.run.companyId,
      source_id: result.run.sourceId,
      scope_type: result.run.scopeType,
      trigger_type: result.run.triggerType,
      status: result.run.status,
      items_collected: result.run.itemsCollected,
      outputs_written: result.run.outputsWritten,
      signals_written: result.run.signalsWritten,
      enrichments_written: result.run.enrichmentsWritten,
      metadata: {},
    })));

    await this.client.upsert('source_documents', results.flatMap((result) => result.documents.map((document) => ({
      id: document.id,
      company_id: document.companyId,
      source_id: document.sourceId,
      document_type: document.documentType,
      external_id: document.externalId,
      canonical_url: document.canonicalUrl,
      title: document.title,
      published_at: document.publishedAt,
      observed_at: document.observedAt,
      content_hash: document.contentHash,
      raw_payload: document.rawPayload,
      normalized_payload: document.normalizedPayload,
      extraction_status: document.extractionStatus,
    }))), 'id');
  }

  async saveAliases(aliases: AliasRecord[]) {
    if (!this.client || !aliases.length) return;

    await this.client.upsert('company_entity_aliases', aliases.map((alias) => ({
      company_id: alias.companyId,
      alias_type: alias.aliasType,
      alias_value: alias.aliasValue,
      confidence_score: alias.confidenceScore,
    })), 'company_id,alias_type,alias_value');
  }

  async saveEngineRequests(requests: EngineRequestRecord[]) {
    if (!this.client || !requests.length) return;

    await this.client.insert('engine_requests', requests.map((request) => ({
      requester_engine: request.requesterEngine,
      target_engine: request.targetEngine,
      company_id: request.companyId,
      source_id: request.sourceId,
      request_type: request.requestType,
      priority: request.priority,
      status: request.status,
      reason: request.reason,
      evidence_payload: request.evidencePayload,
      response_payload: request.responsePayload ?? {},
    })));
  }

  async saveImprovementProposal(input: ImprovementProposalInput) {
    if (!this.client) return;

    await this.client.insert('code_improvement_proposals', [{
      engine_name: input.engineName,
      proposal_type: input.proposalType,
      title: input.title,
      rationale: input.rationale,
      target_module: input.targetModule,
      status: 'draft',
      risk_level: input.riskLevel ?? 'medium',
      proposal_payload: {
        ...(input.proposalPayload ?? {}),
        improvement_mode: classifyImprovementMode(input.targetModule),
      },
      test_plan: [],
    }]);
  }

  async saveLearningEvent(input: LearningEventInput) {
    if (!this.client) return;

    await this.client.insert('engine_learning_events', [{
      engine_name: input.engineName,
      company_id: input.companyId,
      source_id: input.sourceId,
      event_type: input.eventType,
      severity: input.severity,
      summary: input.summary,
      payload: input.payload ?? {},
    }]);
  }

  async listLearningEvents() {
    if (!this.client) return [];
    return this.client.select('engine_learning_events', { select: '*', orderBy: { column: 'created_at', ascending: false }, limit: 50 });
  }

  async listEngineRequests() {
    if (!this.client) return [];
    return this.client.select('engine_requests', { select: '*', orderBy: { column: 'created_at', ascending: false }, limit: 50 });
  }

  async listImprovementProposals() {
    if (!this.client) return [];
    return this.client.select('code_improvement_proposals', { select: '*', orderBy: { column: 'created_at', ascending: false }, limit: 50 });
  }
}
