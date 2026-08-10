import type { SearchProfile } from '../types/platform.js';
import { discoveryHitToCandidateDraft, type DiscoveredCandidateDraft } from '../lib/candidatePromotion.js';
import { assertCandidatePromotionReady } from '../lib/candidatePromotionReadiness.js';
import type {
  CandidateIdentityApprovalInput,
  CandidateIdentityRejectionInput,
  CandidateIdentityReviewResult,
} from '../lib/candidateIdentityReview.js';
import { runSearchProfileDiscovery } from '../lib/discoveryCapture.js';
import { attributeDiscoveryPublishers } from '../lib/discoveryPublisherAttribution.js';
import { normalizeDiscoveryEntityHits } from '../lib/discoveryEntityNormalization.js';
import { filterDiscoveryHitsByProfileRelevance } from '../lib/discoveryRelevance.js';
import { findBestCompanyMatch, type ExistingCompanyMatchCandidate } from '../lib/companyDiscoveryMatching.js';

export type SearchProfileRunRecord = {
  id: string;
  searchProfileId: string;
  runStatus: 'queued' | 'running' | 'completed' | 'failed';
  triggerMode: 'manual' | 'scheduled' | 'bootstrap';
  sourceCount: number;
  candidatesFound: number;
  candidatesInserted: number;
  candidatesPromoted: number;
  notes?: string;
  metadata: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DiscoveredCandidateRecord = DiscoveredCandidateDraft & {
  id: string;
  searchProfileRunId?: string;
  candidateStatus: 'captured' | 'deduped' | 'promoted' | 'discarded';
  companyId?: string;
  capturedAt: string;
  promotedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SearchResultCandidateRecord = DiscoveredCandidateRecord & {
  isNewCandidate: boolean;
  matchState: 'new' | 'existing_candidate' | 'company_master';
  currentSearchSourceRef: string;
  currentSearchEvidenceSummary: string;
};

export type SearchProfileCaptureAdapter = {
  getSearchProfile(searchProfileId: string): Promise<SearchProfile | null>;
  listExistingCompanies(): Promise<ExistingCompanyMatchCandidate[]>;
  createSearchProfileRun(input: { searchProfileId: string; triggerMode: 'manual' | 'scheduled' | 'bootstrap'; startedAt: string; metadata?: Record<string, unknown> }): Promise<SearchProfileRunRecord>;
  updateSearchProfileRun(runId: string, patch: Partial<SearchProfileRunRecord>): Promise<SearchProfileRunRecord>;
  insertDiscoveredCandidates(candidates: Array<Omit<DiscoveredCandidateRecord, 'id' | 'capturedAt' | 'createdAt' | 'updatedAt'>>): Promise<DiscoveredCandidateRecord[]>;
  getDiscoveredCandidate(candidateId: string): Promise<DiscoveredCandidateRecord | null>;
  updateDiscoveredCandidate(candidateId: string, patch: Partial<DiscoveredCandidateRecord>): Promise<DiscoveredCandidateRecord>;
  linkCandidateToCompany(companyId: string, candidateId: string, confidence: number, matchMethod: string): Promise<void>;
};

export type CandidateIdentityReviewExecutor = {
  approve(input: CandidateIdentityApprovalInput): Promise<CandidateIdentityReviewResult>;
  reject(input: CandidateIdentityRejectionInput): Promise<CandidateIdentityReviewResult>;
};

export type SearchProfileCaptureHooks = {
  refreshMonitoring?: (companyId: string) => Promise<unknown>;
  recomputeDerivedData?: (companyId: string) => Promise<unknown>;
};

export type SearchProfileCaptureSummary = {
  run: SearchProfileRunRecord;
  candidates: SearchResultCandidateRecord[];
  dedupedAgainstExisting: number;
  existingCandidates?: number;
  newCandidates?: number;
};

const nowIso = () => new Date().toISOString();

export class SearchProfileCaptureService {
  constructor(
    private readonly adapter: SearchProfileCaptureAdapter,
    private readonly hooks: SearchProfileCaptureHooks = {},
    private readonly identityReviewExecutor?: CandidateIdentityReviewExecutor,
  ) {}

  async runCapture(
    searchProfileId: string,
    triggerMode: 'manual' | 'scheduled' | 'bootstrap' = 'manual',
  ): Promise<SearchProfileCaptureSummary> {
    const profile = await this.adapter.getSearchProfile(searchProfileId);
    if (!profile) throw new Error(`Search profile not found: ${searchProfileId}`);

    const startedAt = nowIso();
    const run = await this.adapter.createSearchProfileRun({
      searchProfileId,
      triggerMode,
      startedAt,
      metadata: {
        profileName: profile.name,
        segment: profile.segment,
        subsegment: profile.subsegment,
        searchMode: profile.profilePayload?.mode ?? 'advanced',
      },
    });

    try {
      const [discovery, existingCompanies] = await Promise.all([
        runSearchProfileDiscovery(profile),
        this.adapter.listExistingCompanies(),
      ]);
      const rawHits = discovery.hits;
      const publishers = await attributeDiscoveryPublishers(rawHits);
      const normalized = normalizeDiscoveryEntityHits(publishers.hits);
      const relevant = filterDiscoveryHitsByProfileRelevance(profile, normalized.hits);
      const hits = relevant.hits;
      const fulfilledLanes = discovery.lanes.filter((lane) => lane.status === 'fulfilled').length;

      let dedupedAgainstExisting = 0;
      const candidatesToInsert = hits.map((hit) => {
        const candidate = discoveryHitToCandidateDraft(profile, hit);
        const match = findBestCompanyMatch(
          {
            companyName: candidate.companyName,
            cnpj: candidate.cnpj,
            website: candidate.website,
          },
          existingCompanies,
        );

        if (match) dedupedAgainstExisting += 1;

        const candidateStatus: 'deduped' | 'captured' = match ? 'deduped' : 'captured';
        return {
          searchProfileRunId: run.id,
          candidateStatus,
          companyId: match?.companyId,
          promotedAt: undefined,
          ...candidate,
          rawPayload: {
            ...candidate.rawPayload,
            entityResolution: match
              ? {
                version: 'v11',
                autoMatched: true,
                companyId: match.companyId,
                method: match.matchMethod,
                confidence: match.confidence,
              }
              : {
                version: 'v11',
                autoMatched: false,
                reason: 'no_exact_identity_key',
              },
          },
        };
      });

      const insertedCandidates = await this.adapter.insertDiscoveredCandidates(candidatesToInsert);
      const insertedByKey = new Map(insertedCandidates.map((candidate) => [candidate.dedupeKey, candidate]));
      const responseAt = nowIso();
      const visibleCandidates: SearchResultCandidateRecord[] = candidatesToInsert.map((candidate, index) => {
        const inserted = insertedByKey.get(candidate.dedupeKey);
        if (inserted) {
          return {
            ...inserted,
            isNewCandidate: true,
            matchState: candidate.companyId ? 'company_master' : 'new',
            currentSearchSourceRef: candidate.sourceRef,
            currentSearchEvidenceSummary: candidate.evidenceSummary,
          };
        }

        return {
          ...candidate,
          id: `search-result-${run.id}-${index + 1}`,
          capturedAt: startedAt,
          createdAt: startedAt,
          updatedAt: responseAt,
          isNewCandidate: false,
          matchState: candidate.companyId ? 'company_master' : 'existing_candidate',
          currentSearchSourceRef: candidate.sourceRef,
          currentSearchEvidenceSummary: candidate.evidenceSummary,
        };
      });

      const qualityNote = [
        `${rawHits.length} bruto(s)`,
        `${publishers.attributed} publisher(s) governado(s) atribuído(s)`,
        `${publishers.unresolved} publisher(s) preservado(s) sem catálogo`,
        `${normalized.hits.length} entidade(s) normalizada(s)`,
        `${normalized.rejected} entidade(s) rejeitada(s)`,
        `${relevant.rejected} irrelevante(s) para a tese`,
        `${hits.length} candidata(s) final(is)`,
        `${normalized.rewritten} nome(s) normalizado(s)`,
        `${normalized.expanded} expansão(ões)`,
      ].join(', ');
      const completed = await this.adapter.updateSearchProfileRun(run.id, {
        runStatus: 'completed',
        sourceCount: fulfilledLanes,
        candidatesFound: hits.length,
        candidatesInserted: insertedCandidates.length,
        candidatesPromoted: 0,
        notes: hits.length
          ? `Capture V11 across ${fulfilledLanes} discovery lane(s); ${insertedCandidates.length} new candidate(s); ${qualityNote}.`
          : `Capture V11 found no relevant company entities after ${fulfilledLanes} discovery lane(s); ${qualityNote}.`,
        finishedAt: nowIso(),
      });

      return {
        run: completed,
        candidates: visibleCandidates,
        dedupedAgainstExisting,
        existingCandidates: Math.max(0, visibleCandidates.length - insertedCandidates.length),
        newCandidates: insertedCandidates.length,
      };
    } catch (error) {
      const failed = await this.adapter.updateSearchProfileRun(run.id, {
        runStatus: 'failed',
        notes: error instanceof Error ? error.message : 'Unknown capture failure',
        finishedAt: nowIso(),
      });

      return {
        run: failed,
        candidates: [],
        dedupedAgainstExisting: 0,
        existingCandidates: 0,
        newCandidates: 0,
      };
    }
  }

  async approveCandidateIdentityReview(input: CandidateIdentityApprovalInput) {
    if (!this.identityReviewExecutor) throw new Error('Candidate identity review executor is unavailable.');
    const result = await this.identityReviewExecutor.approve(input);
    if (result.companyId && this.hooks.refreshMonitoring) {
      await this.hooks.refreshMonitoring(result.companyId).catch(() => undefined);
    }
    return { ...result, derivedDataRecomputeSkipped: true };
  }

  async rejectCandidateIdentityReview(input: CandidateIdentityRejectionInput) {
    if (!this.identityReviewExecutor) throw new Error('Candidate identity review executor is unavailable.');
    return this.identityReviewExecutor.reject(input);
  }

  async promoteCandidate(candidateId: string) {
    const candidate = await this.adapter.getDiscoveredCandidate(candidateId);
    if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);

    assertCandidatePromotionReady(candidate);
    const companyId = candidate.companyId!;

    await this.adapter.linkCandidateToCompany(
      companyId,
      candidateId,
      candidate.confidence,
      'reviewed_identity_promotion',
    );

    const promoted = await this.adapter.updateDiscoveredCandidate(candidateId, {
      candidateStatus: 'promoted',
      companyId,
      promotedAt: nowIso(),
    });

    if (this.hooks.refreshMonitoring) {
      await this.hooks.refreshMonitoring(companyId).catch(() => undefined);
    }

    return {
      companyId,
      created: false,
      candidate: promoted,
    };
  }
}
