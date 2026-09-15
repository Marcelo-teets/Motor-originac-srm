import { randomUUID } from 'node:crypto';
import { OriginationAiRepository } from '../repositories/originationAiRepository.js';
import {
  buildDealMaster,
  calculateReadiness,
  composeIntroPackage,
  normalizeProduct,
  type DealMasterPayload,
  type EvidenceClassification,
  type EvidenceFact,
  type EvidenceMateriality,
} from '../modules/originationAiFlow.js';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const nonEmpty = (value: unknown) => value !== null && value !== undefined && value !== '';

type EvidenceInput = Omit<EvidenceFact, 'id' | 'status'> & { status?: EvidenceFact['status'] };
const fact = (input: EvidenceInput): Omit<EvidenceFact, 'id'> => ({ ...input, status: input.status ?? 'active' });

export class OriginationAiService {
  constructor(private readonly repo = new OriginationAiRepository()) {}

  async getEvidence(companyId: string) { return this.repo.listEvidence(companyId); }
  async getConflicts(companyId: string) { return this.repo.listOpenConflicts(companyId); }
  async getLatestIntro(companyId: string) { return this.repo.getLatestArtifact(companyId, 'intro_package'); }

  async ingestEvidence(companyId: string, input: {
    evidenceKey?: string; sourceKind: string; sourceRecordId?: string; sourceRef?: string;
    fieldKey: string; classification?: EvidenceClassification; value: unknown; sourceExcerpt?: string;
    confidence?: number; materiality?: EvidenceMateriality; effectiveAt?: string; metadata?: Record<string, unknown>;
  }) {
    if (!input.sourceKind || !input.fieldKey) throw new Error('sourceKind e fieldKey são obrigatórios.');
    const row = fact({
      evidenceKey: input.evidenceKey ?? `manual:${companyId}:${input.fieldKey}:${randomUUID()}`,
      companyId,
      sourceKind: input.sourceKind,
      sourceRecordId: input.sourceRecordId,
      sourceRef: input.sourceRef,
      fieldKey: input.fieldKey,
      classification: input.classification ?? 'fact',
      value: input.value,
      sourceExcerpt: input.sourceExcerpt,
      confidence: input.confidence ?? 0.8,
      materiality: input.materiality ?? 'medium',
      effectiveAt: input.effectiveAt ?? new Date().toISOString(),
      metadata: input.metadata ?? {},
    });
    const [saved] = await this.repo.upsertEvidence([row]);
    await this.repo.logAgentRun('source_intelligence', companyId, { evidenceKey: row.evidenceKey }, { evidenceId: saved?.id ?? null });
    return saved;
  }

  private async materializeNativeEvidence(companyId: string) {
    const [company, pipeline, review, documents] = await Promise.all([
      this.repo.getCompany(companyId), this.repo.getPipeline(companyId), this.repo.getLatestCreditReview(companyId), this.repo.listSourceDocuments(companyId),
    ]);
    if (!company) throw new Error('Empresa não encontrada.');
    const rows: Array<Omit<EvidenceFact, 'id'>> = [];
    const add = (row: EvidenceInput) => rows.push(fact(row));
    const companyName = text(company.trade_name) || text(company.legal_name);

    if (companyName) add({ evidenceKey: `companies:${companyId}:companyName`, companyId, sourceKind: 'company_master', sourceRecordId: companyId, fieldKey: 'companyName', classification: 'fact', value: companyName, confidence: 0.95, materiality: 'critical', effectiveAt: company.updated_at });
    if (text(company.description)) add({ evidenceKey: `companies:${companyId}:context`, companyId, sourceKind: 'company_master', sourceRecordId: companyId, fieldKey: 'context', classification: 'fact', value: text(company.description), confidence: 0.75, materiality: 'medium', effectiveAt: company.updated_at });
    if (text(company.current_funding_structure)) add({ evidenceKey: `companies:${companyId}:debtStructure`, companyId, sourceKind: 'company_master', sourceRecordId: companyId, fieldKey: 'debtStructure', classification: 'fact', value: text(company.current_funding_structure), confidence: 0.75, materiality: 'high', effectiveAt: company.updated_at });

    if (pipeline) {
      if (nonEmpty(pipeline.expected_ticket)) add({ evidenceKey: `pipeline:${pipeline.id}:requestedAmount`, companyId, sourceKind: 'pipeline', sourceRecordId: pipeline.id, fieldKey: 'requestedAmount', classification: 'fact', value: pipeline.expected_ticket, confidence: 0.8, materiality: 'critical', effectiveAt: pipeline.updated_at });
      if (text(pipeline.expected_structure)) add({ evidenceKey: `pipeline:${pipeline.id}:probableProduct`, companyId, sourceKind: 'pipeline', sourceRecordId: pipeline.id, fieldKey: 'probableProduct', classification: 'hypothesis', value: normalizeProduct(pipeline.expected_structure), confidence: 0.7, materiality: 'critical', effectiveAt: pipeline.updated_at });
      if (text(pipeline.notes)) add({ evidenceKey: `pipeline:${pipeline.id}:context`, companyId, sourceKind: 'pipeline', sourceRecordId: pipeline.id, fieldKey: 'context', classification: 'fact', value: text(pipeline.notes), confidence: 0.7, materiality: 'medium', effectiveAt: pipeline.updated_at });
    }

    if (review) {
      const reviewConfidence = Number(review.confidence ?? 0.6);
      const confidence = Math.max(0, Math.min(1, reviewConfidence > 1 ? reviewConfidence / 100 : reviewConfidence));
      if (text(review.suggested_structure)) add({ evidenceKey: `credit_review:${review.id}:probableProduct`, companyId, sourceKind: 'credit_review', sourceRecordId: review.id, fieldKey: 'probableProduct', classification: 'analysis', value: normalizeProduct(review.suggested_structure), confidence, materiality: 'critical', effectiveAt: review.updated_at });
      if (review.has_receivables === true || (Array.isArray(review.receivables_type) && review.receivables_type.length)) add({ evidenceKey: `credit_review:${review.id}:receivables`, companyId, sourceKind: 'credit_review', sourceRecordId: review.id, fieldKey: 'receivables', classification: 'analysis', value: { hasReceivables: review.has_receivables, structurable: review.receivables_structurable, types: review.receivables_type ?? [] }, confidence: 0.7, materiality: 'high', effectiveAt: review.updated_at });
      if (text(review.funding_structure_type) || text(review.capital_structure_quality)) add({ evidenceKey: `credit_review:${review.id}:debtStructure`, companyId, sourceKind: 'credit_review', sourceRecordId: review.id, fieldKey: 'debtStructure', classification: 'analysis', value: { fundingStructureType: review.funding_structure_type, capitalStructureQuality: review.capital_structure_quality }, confidence: 0.65, materiality: 'high', effectiveAt: review.updated_at });
    }

    if (documents?.length) add({
      evidenceKey: `source_documents:${companyId}:documentation`, companyId, sourceKind: 'official_document', sourceRecordId: companyId,
      fieldKey: 'documentation', classification: 'fact',
      value: documents.map((item: any) => ({ id: item.id, type: item.document_type, title: item.title, qualityStatus: item.quality_status, observedAt: item.observed_at })),
      confidence: 0.9, materiality: 'high', effectiveAt: documents[0]?.observed_at ?? new Date().toISOString(),
    });

    if (rows.length) await this.repo.upsertEvidence(rows);
  }

  async rebuildDealMaster(companyId: string) {
    await this.materializeNativeEvidence(companyId);
    const allEvidence = await this.repo.listEvidence(companyId);
    const previousArtifact = await this.repo.getLatestArtifact(companyId, 'deal_master');
    const previous = previousArtifact?.payload as DealMasterPayload | undefined;
    const dealMaster = buildDealMaster(companyId, allEvidence, previous ?? null);
    await this.repo.syncConflicts(companyId, dealMaster.conflicts);
    const artifact = await this.repo.saveArtifact(companyId, 'deal_master', `Deal Master — ${dealMaster.companyName ?? companyId}`, dealMaster as unknown as Record<string, unknown>, 'deal_master');
    await this.repo.logAgentRun('deal_master', companyId, { evidenceCount: allEvidence.length }, { artifactId: artifact?.id, conflicts: dealMaster.conflicts.length, warnings: dealMaster.warnings });
    return { artifact, dealMaster };
  }

  async getDealMaster(companyId: string) {
    const artifact = await this.repo.getLatestArtifact(companyId, 'deal_master');
    return artifact ? { ...artifact, payload: artifact.payload as DealMasterPayload } : null;
  }

  async resolveConflict(companyId: string, conflictId: string, input: { selectedEvidenceId?: string; resolutionNote: string; resolvedBy: string }) {
    if (!text(input.resolutionNote) || !text(input.resolvedBy)) throw new Error('resolutionNote e resolvedBy são obrigatórios.');
    const resolved = await this.repo.resolveConflict(companyId, conflictId, input);
    await this.repo.logAgentRun('human_conflict_resolution', companyId, { conflictId, selectedEvidenceId: input.selectedEvidenceId }, { resolved: Boolean(resolved) }, { resolvedBy: input.resolvedBy });
    const rebuilt = await this.rebuildDealMaster(companyId);
    const readiness = await this.recalculateReadiness(companyId);
    return { resolved, dealMaster: rebuilt.dealMaster, readiness: readiness.readiness };
  }

  async recalculateReadiness(companyId: string) {
    let dealArtifact = await this.repo.getLatestArtifact(companyId, 'deal_master');
    if (!dealArtifact) dealArtifact = (await this.rebuildDealMaster(companyId)).artifact;
    if (!dealArtifact) throw new Error('Deal Master não disponível.');
    const deal = dealArtifact.payload as DealMasterPayload;
    const openConflicts = await this.repo.listOpenConflicts(companyId);
    const openCritical = (openConflicts ?? []).filter((item: any) => item.severity === 'critical').length;
    const readiness = calculateReadiness(deal, openCritical);
    const artifact = await this.repo.saveArtifact(companyId, 'intro_readiness', `Intro Readiness — ${deal.companyName ?? companyId}`, readiness as unknown as Record<string, unknown>, 'readiness_governance');
    await this.repo.logAgentRun('readiness_governance', companyId, { dealMasterArtifactId: dealArtifact.id, openCritical }, readiness as unknown as Record<string, unknown>);
    return { artifact, readiness };
  }

  async generateIntro(companyId: string) {
    const rebuilt = await this.rebuildDealMaster(companyId);
    if (!rebuilt.artifact) throw new Error('Deal Master não disponível.');
    const readinessRun = await this.recalculateReadiness(companyId);
    if (!readinessRun.artifact) throw new Error('Readiness não disponível.');
    const intro = composeIntroPackage(rebuilt.dealMaster, readinessRun.readiness);
    const artifact = await this.repo.saveArtifact(companyId, 'intro_package', `Intro Estruturação — ${rebuilt.dealMaster.companyName ?? companyId}`, intro as unknown as Record<string, unknown>, 'intro_composer');
    await this.repo.logAgentRun('intro_composer', companyId, { dealMasterArtifactId: rebuilt.artifact.id, readinessArtifactId: readinessRun.artifact.id }, { artifactId: artifact?.id, approvalStatus: intro.approvalStatus });
    return { artifact, intro };
  }

  async approveIntro(companyId: string, artifactId: string, approvedBy: string) {
    if (!text(approvedBy)) throw new Error('approvedBy é obrigatório.');
    return this.repo.approveArtifact(companyId, artifactId, approvedBy);
  }
}
