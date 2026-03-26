import type { CompanySeed, SearchProfile } from '../types/platform.js';
import { candidateDraftToCompanySeed, discoveryHitToCandidateDraft, type DiscoveredCandidateDraft } from '../lib/candidatePromotion.js';
import { runSearchProfileDiscovery } from '../lib/discoveryCapture.js';
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
  searchProfileRunId: string;
  candidateStatus: 'captured' | 'deduped' | 'promoted' | 'discarded';
  companyId?: string;
  capturedAt: string;
  promotedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SearchProfileCaptureAdapter = {
  getSearchProfile(searchProfileId: string): Promise<SearchProfile | null>;
  listExistingCompanies(): Promise<ExistingCompanyMatchCandidate[]>;
  createSearchProfileRun(input: { searchProfileId: string; triggerMode: 'manual' | 'scheduled' | 'bootstrap'; startedAt: string; metadata?: Record<string, unknown> }): Promise<SearchProfileRunRecord>;
  updateSearchProfileRun(runId: string, patch: Partial<SearchProfileRunRecord>): Promise<SearchProfileRunRecord>;
  insertDiscoveredCandidates(candidates: Array<Omit<DiscoveredCandidateRecord, 'id' | 'capturedAt' | 'createdAt' | 'updatedAt'>>): Promise<DiscoveredCandidateRecord[]>;
  getDiscoveredCandidate(candidateId: string): Promise<DiscoveredCandidateRecord | null>;
  updateDiscoveredCandidate(candidateId: string, patch: Partial<DiscoveredCandidateRecord>): Promise<DiscoveredCandidateRecord>;
  upsertCompanySeed(company: CompanySeed): Promise<{ companyId: string; created: boolean }>;
  linkCandidateToCompany(companyId: string, candidateId: string, confidence: number, matchMethod: string): Promise<void>;
};

export type SearchProfileCaptureHooks = {
  refreshMonitoring?: (companyId: string) => Promise<unknown>;
  recomputeDerivedData?: (companyId: string) => Promise<unknown>;
};

export type SearchProfileCaptureSummary = {
  run: SearchProfileRunRecord;
  candidates: DiscoveredCandidateRecord[];
  dedupedAgainstExisting: number;
};

const nowIso = () => new Date().toISOString();

export class SearchProfileCaptureService {
  constructor(
    private readonly adapter: SearchProfileCaptureAdapter,
    private readonly hooks: SearchProfileCaptureHooks = {},
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
      },
    });

    try {
      const [hits, existingCompanies] = await Promise.all([
        runSearchProfileDiscovery(profile),
        this.adapter.listExistingCompanies(),
      ]);

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

        return {
          searchProfileRunId: run.id,
          candidateStatus: match ? 'deduped' : 'captured',
          companyId: match?.companyId,
          promotedAt: undefined,
          ...candidate,
        };
      });

      const insertedCandidates = await this.adapter.insertDiscoveredCandidates(candidatesToInsert);
      const completed = await this.adapter.updateSearchProfileRun(run.id, {
        runStatus: 'completed',
        sourceCount: hits.length ? 1 : 0,
        candidatesFound: hits.length,
        candidatesInserted: insertedCandidates.length,
        candidatesPromoted: 0,
        notes: hits.length ? 'Capture executed successfully.' : 'No candidates found for this profile.',
        finishedAt: nowIso(),
      });

      return {
        run: completed,
        candidates: insertedCandidates,
        dedupedAgainstExisting,
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
      };
    }
  }

  async promoteCandidate(candidateId: string) {
    const candidate = await this.adapter.getDiscoveredCandidate(candidateId);
    if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);

    const companySeed = candidateDraftToCompanySeed(candidate);
    const companyResult = await this.adapter.upsertCompanySeed(companySeed);

    await this.adapter.linkCandidateToCompany(
      companyResult.companyId,
      candidateId,
      candidate.confidence,
      candidate.companyId ? 'deduped_promotion' : 'manual_promotion',
    );

    const promoted = await this.adapter.updateDiscoveredCandidate(candidateId, {
      candidateStatus: 'promoted',
      companyId: companyResult.companyId,
      promotedAt: nowIso(),
    });

    if (this.hooks.refreshMonitoring) {
      await this.hooks.refreshMonitoring(companyResult.companyId).catch(() => undefined);
    }

    if (this.hooks.recomputeDerivedData) {
      await this.hooks.recomputeDerivedData(companyResult.companyId).catch(() => undefined);
    }

    return {
      companyId: companyResult.companyId,
      created: companyResult.created,
      candidate: promoted,
    };
  }
}
