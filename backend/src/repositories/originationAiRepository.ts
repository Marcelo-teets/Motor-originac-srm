import { getSupabaseClient } from '../lib/supabase.js';
import type { AiConflict, EvidenceFact } from '../modules/originationAiFlow.js';

const mapEvidence = (row: any): EvidenceFact => ({
  id: row.id,
  evidenceKey: row.evidence_key,
  companyId: row.company_id,
  sourceKind: row.source_kind,
  sourceRecordId: row.source_record_id,
  sourceRef: row.source_ref,
  fieldKey: row.field_key,
  classification: row.classification,
  value: row.value_json,
  sourceExcerpt: row.source_excerpt,
  confidence: Number(row.confidence ?? 0.5),
  materiality: row.materiality,
  effectiveAt: row.effective_at,
  status: row.status,
  metadata: row.metadata ?? {},
});

export class OriginationAiRepository {
  private readonly client = getSupabaseClient();

  private db() {
    if (!this.client) throw new Error('Supabase não configurado para o Origination AI Flow.');
    return this.client;
  }

  async getCompany(companyId: string) {
    const rows = await this.db().select('companies', { select: '*', filters: [{ column: 'id', value: companyId }], limit: 1 });
    return rows?.[0] ?? null;
  }

  async getPipeline(companyId: string) {
    const rows = await this.db().select('pipeline', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'updated_at', ascending: false }, limit: 1 });
    return rows?.[0] ?? null;
  }

  async getLatestCreditReview(companyId: string) {
    const rows = await this.db().select('company_credit_reviews', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'review_version', ascending: false }, limit: 1 });
    return rows?.[0] ?? null;
  }

  async listSourceDocuments(companyId: string) {
    return this.db().select('source_documents', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'observed_at', ascending: false }, limit: 200 });
  }

  async listSignals(companyId: string, limit = 100) {
    return this.db().select('company_signals', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'observed_at', ascending: false }, limit });
  }

  async listEvidence(companyId: string) {
    const rows = await this.db().select('company_evidence_facts', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 1000 });
    return (rows ?? []).map(mapEvidence);
  }

  async upsertEvidence(facts: Array<Omit<EvidenceFact, 'id'> & { id?: string }>) {
    if (!facts.length) return [] as EvidenceFact[];
    const rows = facts.map((fact) => ({
      ...(fact.id ? { id: fact.id } : {}),
      evidence_key: fact.evidenceKey,
      company_id: fact.companyId,
      source_kind: fact.sourceKind,
      source_record_id: fact.sourceRecordId ?? null,
      source_ref: fact.sourceRef ?? null,
      field_key: fact.fieldKey,
      classification: fact.classification,
      value_json: fact.value ?? null,
      source_excerpt: fact.sourceExcerpt ?? null,
      confidence: fact.confidence,
      materiality: fact.materiality,
      effective_at: fact.effectiveAt ?? null,
      status: fact.status,
      metadata: fact.metadata ?? {},
      updated_at: new Date().toISOString(),
    }));
    const saved = await this.db().upsert('company_evidence_facts', rows, 'evidence_key');
    return (saved ?? []).map(mapEvidence);
  }

  async listOpenConflicts(companyId: string) {
    return this.db().select('company_ai_conflicts', {
      select: '*',
      filters: [{ column: 'company_id', value: companyId }, { column: 'status', value: 'open' }],
      orderBy: { column: 'created_at', ascending: false },
      limit: 200,
    });
  }

  async syncConflicts(companyId: string, conflicts: AiConflict[]) {
    const existing = await this.listOpenConflicts(companyId);
    const desiredKeys = new Set(conflicts.map((item) => `${item.fieldKey}:${item.conflictType}`));

    for (const row of existing ?? []) {
      const key = `${row.field_key}:${row.conflict_type}`;
      if (!desiredKeys.has(key)) {
        await this.db().update('company_ai_conflicts', {
          status: 'dismissed',
          resolution_note: 'Conflito não reproduzido no rebuild mais recente do Deal Master.',
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, [{ column: 'id', value: row.id }]);
      }
    }

    for (const conflict of conflicts) {
      const current = (existing ?? []).find((row: any) => row.field_key === conflict.fieldKey && row.conflict_type === conflict.conflictType);
      const payload = {
        company_id: companyId,
        field_key: conflict.fieldKey,
        severity: conflict.severity,
        conflict_type: conflict.conflictType,
        evidence_ids: conflict.evidenceIds,
        description: conflict.description,
        recommended_resolution: conflict.recommendedResolution ?? null,
        human_question: conflict.humanQuestion ?? null,
        human_review_required: conflict.humanReviewRequired,
        updated_at: new Date().toISOString(),
      };
      if (current) await this.db().update('company_ai_conflicts', payload, [{ column: 'id', value: current.id }]);
      else await this.db().insert('company_ai_conflicts', [{ ...payload, status: 'open' }]);
    }
  }

  async resolveConflict(companyId: string, conflictId: string, input: { selectedEvidenceId?: string; resolutionNote: string; resolvedBy: string }) {
    const rows = await this.db().update('company_ai_conflicts', {
      status: 'resolved',
      selected_evidence_id: input.selectedEvidenceId ?? null,
      resolution_note: input.resolutionNote,
      resolved_by: input.resolvedBy,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, [{ column: 'id', value: conflictId }, { column: 'company_id', value: companyId }]);
    return rows?.[0] ?? null;
  }

  async getLatestArtifact(companyId: string, artifactType: string) {
    const rows = await this.db().select('origination_os_artifacts', {
      select: '*',
      filters: [{ column: 'company_id', value: companyId }, { column: 'artifact_type', value: artifactType }, { column: 'status', value: 'active' }],
      orderBy: { column: 'updated_at', ascending: false },
      limit: 1,
    });
    return rows?.[0] ?? null;
  }

  async saveArtifact(companyId: string, artifactType: string, title: string, payload: Record<string, unknown>, generatedBy: string, status = 'active') {
    const previous = await this.db().select('origination_os_artifacts', {
      select: 'id', filters: [{ column: 'company_id', value: companyId }, { column: 'artifact_type', value: artifactType }, { column: 'status', value: 'active' }], limit: 100,
    });
    for (const row of previous ?? []) {
      await this.db().update('origination_os_artifacts', { status: 'superseded', updated_at: new Date().toISOString() }, [{ column: 'id', value: row.id }]);
    }
    const now = new Date().toISOString();
    const id = `${artifactType}:${companyId}:${now.replace(/[^0-9]/g, '')}`;
    const rows = await this.db().insert('origination_os_artifacts', [{
      id,
      company_id: companyId,
      artifact_type: artifactType,
      title,
      description: `Generated by ${generatedBy}`,
      payload,
      generated_by: generatedBy,
      status,
      version: '2026.09.15',
      created_at: now,
      updated_at: now,
    }]);
    return rows?.[0] ?? null;
  }

  async approveArtifact(companyId: string, artifactId: string, approvedBy: string) {
    const rows = await this.db().update('origination_os_artifacts', {
      status: 'approved',
      payload: undefined,
      updated_at: new Date().toISOString(),
    }, [{ column: 'id', value: artifactId }, { column: 'company_id', value: companyId }]);
    const artifact = rows?.[0] ?? null;
    await this.logAgentRun('human_intro_approval', companyId, { artifactId }, { approved: Boolean(artifact) }, { approvedBy });
    return artifact;
  }

  async logAgentRun(agentKey: string, companyId: string, input: Record<string, unknown>, output: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
    const rows = await this.db().insert('ai_agent_runs', [{
      context_type: 'company',
      context_id: companyId,
      agent_key: agentKey,
      plugins: [],
      input,
      output,
      metadata,
    }]);
    return rows?.[0] ?? null;
  }
}
