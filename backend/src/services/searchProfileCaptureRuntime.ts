import type { PlatformRepository } from '../repositories/platformRepository.js';
import { getSupabaseClient } from '../lib/supabase.js';
import type { CompanySeed, SearchProfile } from '../types/platform.js';
import type { ExistingCompanyMatchCandidate } from '../lib/companyDiscoveryMatching.js';
import type { DiscoveredCandidateRecord, SearchProfileCaptureAdapter, SearchProfileRunRecord } from './searchProfileCaptureService.js';

type SupabaseLike = NonNullable<ReturnType<typeof getSupabaseClient>>;

// Mapeia um candidato preparado para a linha do PostgREST. Coage undefined ->
// null em todos os campos opcionais para que o insert em lote tenha chaves
// homogêneas (PostgREST PGRST102 "All object keys must match" ocorre quando
// JSON.stringify omite chaves undefined em parte dos objetos).
export const discoveredCandidateToRow = (candidate: DiscoveredCandidateRecord) => ({
  id: candidate.id,
  search_profile_run_id: candidate.searchProfileRunId ?? null,
  search_profile_id: candidate.searchProfileId ?? null,
  company_name: candidate.companyName,
  legal_name: candidate.legalName ?? null,
  website: candidate.website ?? null,
  normalized_domain: candidate.normalizedDomain ?? null,
  cnpj: candidate.cnpj ?? null,
  geography: candidate.geography ?? null,
  segment: candidate.segment ?? null,
  subsegment: candidate.subsegment ?? null,
  company_type: candidate.companyType ?? null,
  credit_product: candidate.creditProduct ?? null,
  target_structure: candidate.targetStructure ?? null,
  source_ref: candidate.sourceRef,
  source_url: candidate.sourceUrl ?? null,
  evidence_summary: candidate.evidenceSummary ?? null,
  receivables: candidate.receivables ?? [],
  confidence: candidate.confidence,
  candidate_status: candidate.candidateStatus,
  company_id: candidate.companyId ?? null,
  dedupe_key: candidate.dedupeKey,
  raw_payload: candidate.rawPayload ?? {},
  captured_at: candidate.capturedAt,
  promoted_at: candidate.promotedAt ?? null,
  created_at: candidate.createdAt,
  updated_at: candidate.updatedAt,
});

const mapCompanySeedToRow = (company: CompanySeed) => ({
  id: company.id,
  legal_name: company.legalName,
  trade_name: company.tradeName,
  cnpj: company.cnpj,
  segment: company.segment,
  subsegment: company.subsegment,
  geography: company.geography,
  company_type: company.companyType,
  stage: company.stage,
  website: company.website,
  current_funding_structure: company.currentFundingStructure,
  observed_payload: {
    description: company.description,
    credit_product: company.creditProduct,
    receivables: company.receivables,
    monitoring: company.monitoring,
    signals: company.signals,
  },
  inferred_payload: { enrichment: company.enrichment },
  estimated_payload: { marketMapPeers: company.marketMapPeers, activities: company.activities },
  source_trace: company.sourceRecords,
});

const normalizeCandidateStatus = (value: unknown): DiscoveredCandidateRecord['candidateStatus'] => {
  if (value === 'promoted') return 'promoted';
  if (value === 'deduped') return 'deduped';
  if (value === 'discarded' || value === 'rejected') return 'discarded';
  return 'captured';
};

const normalizeCandidateReceivables = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (value && typeof value === 'object') {
    const instruments = (value as Record<string, unknown>).instrumentTypes;
    if (Array.isArray(instruments) && instruments.includes('FIDC')) {
      return ['FIDC identificado em registro CVM — validar carteira, originador e lastro'];
    }
  }
  return [];
};

const mapCandidateRow = (row: any): DiscoveredCandidateRecord => ({
  id: row.id,
  searchProfileRunId: row.search_profile_run_id ?? undefined,
  searchProfileId: row.search_profile_id ?? undefined,
  companyName: row.company_name,
  legalName: row.legal_name ?? undefined,
  website: row.website ?? undefined,
  normalizedDomain: row.normalized_domain ?? undefined,
  cnpj: row.cnpj ?? undefined,
  geography: row.geography ?? 'Brasil',
  segment: row.segment ?? 'Unknown',
  subsegment: row.subsegment ?? 'Unknown',
  companyType: row.company_type ?? 'Unknown',
  creditProduct: row.credit_product ?? 'Unknown',
  targetStructure: row.target_structure ?? 'Unknown',
  sourceRef: row.source_ref ?? 'unknown',
  sourceUrl: row.source_url ?? undefined,
  evidenceSummary: row.evidence_summary ?? '',
  receivables: normalizeCandidateReceivables(row.receivables),
  confidence: Number(row.confidence ?? 0.5),
  candidateStatus: normalizeCandidateStatus(row.candidate_status),
  companyId: row.company_id ?? undefined,
  dedupeKey: row.dedupe_key ?? '',
  rawPayload: row.raw_payload ?? {},
  capturedAt: row.captured_at,
  promotedAt: row.promoted_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SearchProfileCaptureRuntime implements SearchProfileCaptureAdapter {
  private readonly client: SupabaseLike | null = getSupabaseClient();
  private runs: SearchProfileRunRecord[] = [];
  private candidates: DiscoveredCandidateRecord[] = [];

  constructor(private readonly repository: PlatformRepository) {}

  async getSearchProfile(searchProfileId: string): Promise<SearchProfile | null> {
    const profiles = await this.repository.listSearchProfiles();
    return profiles.find((item) => item.id === searchProfileId) ?? null;
  }

  async listExistingCompanies(): Promise<ExistingCompanyMatchCandidate[]> {
    return (await this.repository.listCompanies()).map((company) => ({
      id: company.id,
      name: company.tradeName,
      cnpj: company.cnpj,
      website: company.website,
    }));
  }

  async createSearchProfileRun(input: { searchProfileId: string; triggerMode: 'manual' | 'scheduled' | 'bootstrap'; startedAt: string; metadata?: Record<string, unknown> }): Promise<SearchProfileRunRecord> {
    const now = new Date().toISOString();
    const run: SearchProfileRunRecord = {
      id: crypto.randomUUID(),
      searchProfileId: input.searchProfileId,
      runStatus: 'running',
      triggerMode: input.triggerMode,
      sourceCount: 0,
      candidatesFound: 0,
      candidatesInserted: 0,
      candidatesPromoted: 0,
      notes: 'Capture started.',
      metadata: input.metadata ?? {},
      startedAt: input.startedAt,
      createdAt: now,
      updatedAt: now,
    };

    if (!this.client) {
      this.runs.unshift(run);
      return run;
    }

    const [row] = await this.client.insert('search_profile_runs', [{
      id: run.id,
      search_profile_id: run.searchProfileId,
      run_status: run.runStatus,
      trigger_mode: run.triggerMode,
      source_count: run.sourceCount,
      candidates_found: run.candidatesFound,
      candidates_inserted: run.candidatesInserted,
      candidates_promoted: run.candidatesPromoted,
      notes: run.notes,
      metadata: run.metadata,
      started_at: run.startedAt,
      created_at: run.createdAt,
      updated_at: run.updatedAt,
    }]);

    return {
      ...run,
      id: row?.id ?? run.id,
      createdAt: row?.created_at ?? run.createdAt,
      updatedAt: row?.updated_at ?? run.updatedAt,
    };
  }

  async updateSearchProfileRun(runId: string, patch: Partial<SearchProfileRunRecord>): Promise<SearchProfileRunRecord> {
    if (!this.client) {
      const current = this.runs.find((item) => item.id === runId);
      if (!current) throw new Error(`Run not found: ${runId}`);
      const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
      this.runs = this.runs.map((item) => item.id === runId ? updated : item);
      return updated;
    }

    const payload = {
      ...(patch.runStatus !== undefined ? { run_status: patch.runStatus } : {}),
      ...(patch.sourceCount !== undefined ? { source_count: patch.sourceCount } : {}),
      ...(patch.candidatesFound !== undefined ? { candidates_found: patch.candidatesFound } : {}),
      ...(patch.candidatesInserted !== undefined ? { candidates_inserted: patch.candidatesInserted } : {}),
      ...(patch.candidatesPromoted !== undefined ? { candidates_promoted: patch.candidatesPromoted } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.finishedAt !== undefined ? { finished_at: patch.finishedAt } : {}),
      updated_at: new Date().toISOString(),
    };

    const rows = await this.client.update('search_profile_runs', payload, [{ column: 'id', operator: 'eq', value: runId }]);
    const row = rows?.[0];
    if (!row) throw new Error(`Run not found after update: ${runId}`);

    return {
      id: row.id,
      searchProfileId: row.search_profile_id,
      runStatus: row.run_status,
      triggerMode: row.trigger_mode,
      sourceCount: Number(row.source_count ?? 0),
      candidatesFound: Number(row.candidates_found ?? 0),
      candidatesInserted: Number(row.candidates_inserted ?? 0),
      candidatesPromoted: Number(row.candidates_promoted ?? 0),
      notes: row.notes ?? undefined,
      metadata: row.metadata ?? {},
      startedAt: row.started_at ?? undefined,
      finishedAt: row.finished_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async insertDiscoveredCandidates(candidates: Array<Omit<DiscoveredCandidateRecord, 'id' | 'capturedAt' | 'createdAt' | 'updatedAt'>>): Promise<DiscoveredCandidateRecord[]> {
    const now = new Date().toISOString();
    const prepared = candidates.map((candidate) => ({
      ...candidate,
      id: crypto.randomUUID(),
      capturedAt: now,
      createdAt: now,
      updatedAt: now,
    }));

    if (!this.client) {
      this.candidates.unshift(...prepared);
      return prepared;
    }

    const rows = await this.client.insert('discovered_company_candidates', prepared.map(discoveredCandidateToRow));

    return (rows ?? []).map(mapCandidateRow);
  }

  async getDiscoveredCandidate(candidateId: string): Promise<DiscoveredCandidateRecord | null> {
    if (!this.client) return this.candidates.find((item) => item.id === candidateId) ?? null;
    const rows = await this.client.select('discovered_company_candidates', { select: '*', filters: [{ column: 'id', operator: 'eq', value: candidateId }], limit: 1 });
    const row = rows?.[0];
    if (!row) return null;
    return mapCandidateRow(row);
  }

  async updateDiscoveredCandidate(candidateId: string, patch: Partial<DiscoveredCandidateRecord>): Promise<DiscoveredCandidateRecord> {
    if (!this.client) {
      const current = this.candidates.find((item) => item.id === candidateId);
      if (!current) throw new Error(`Candidate not found: ${candidateId}`);
      const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
      this.candidates = this.candidates.map((item) => item.id === candidateId ? updated : item);
      return updated;
    }

    const rows = await this.client.update('discovered_company_candidates', {
      ...(patch.candidateStatus !== undefined ? { candidate_status: patch.candidateStatus } : {}),
      ...(patch.companyId !== undefined ? { company_id: patch.companyId } : {}),
      ...(patch.promotedAt !== undefined ? { promoted_at: patch.promotedAt } : {}),
      updated_at: new Date().toISOString(),
    }, [{ column: 'id', operator: 'eq', value: candidateId }]);

    const row = rows?.[0];
    if (!row) throw new Error(`Candidate not found after update: ${candidateId}`);
    return (await this.getDiscoveredCandidate(row.id))!;
  }

  async upsertCompanySeed(company: CompanySeed): Promise<{ companyId: string; created: boolean }> {
    const current = (await this.repository.listCompanies()).find((item) => item.id === company.id);
    if (!this.client) {
      return { companyId: company.id, created: !current };
    }
    await this.client.upsert('companies', [mapCompanySeedToRow(company)], 'id');
    return { companyId: company.id, created: !current };
  }

  async linkCandidateToCompany(companyId: string, candidateId: string, confidence: number, matchMethod: string): Promise<void> {
    if (!this.client) return;
    await this.client.upsert('company_discovery_links', [{
      company_id: companyId,
      discovered_candidate_id: candidateId,
      confidence,
      match_method: matchMethod,
    }], 'company_id,discovered_candidate_id');
  }

  async listRuns(searchProfileId?: string) {
    if (!this.client) {
      return searchProfileId ? this.runs.filter((item) => item.searchProfileId === searchProfileId) : this.runs;
    }
    const rows = await this.client.select('search_profile_runs', {
      select: '*',
      ...(searchProfileId ? { filters: [{ column: 'search_profile_id', operator: 'eq', value: searchProfileId }] } : {}),
      orderBy: { column: 'created_at', ascending: false },
      limit: 100,
    });
    return rows ?? [];
  }

  async listCandidates(searchProfileId?: string) {
    if (!this.client) {
      return searchProfileId ? this.candidates.filter((item) => item.searchProfileId === searchProfileId) : this.candidates;
    }
    const rows = await this.client.select('discovered_company_candidates', {
      select: '*',
      ...(searchProfileId ? { filters: [{ column: 'search_profile_id', operator: 'eq', value: searchProfileId }] } : {}),
      orderBy: { column: 'created_at', ascending: false },
      limit: 200,
    });
    return rows ?? [];
  }
}
