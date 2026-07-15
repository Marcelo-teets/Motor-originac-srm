import fs from 'node:fs';

const path = 'backend/src/services/searchProfileCaptureRuntime.ts';
let source = fs.readFileSync(path, 'utf8');

const helperAnchor = `const mapCompanySeedToRow = (company: CompanySeed) => ({
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
});`;

const helpers = `${helperAnchor}

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
});`;

if (!source.includes(helperAnchor)) throw new Error('mapCompanySeedToRow anchor not found');
source = source.replace(helperAnchor, helpers);

const firstMap = `    return (rows ?? []).map((row: any) => ({
      id: row.id,
      searchProfileRunId: row.search_profile_run_id,
      searchProfileId: row.search_profile_id,
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
      receivables: row.receivables ?? [],
      confidence: Number(row.confidence ?? 0.5),
      candidateStatus: row.candidate_status,
      companyId: row.company_id ?? undefined,
      dedupeKey: row.dedupe_key ?? '',
      rawPayload: row.raw_payload ?? {},
      capturedAt: row.captured_at,
      promotedAt: row.promoted_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));`;
if (!source.includes(firstMap)) throw new Error('insert mapping anchor not found');
source = source.replace(firstMap, `    return (rows ?? []).map(mapCandidateRow);`);

const secondMap = `    return {
      id: row.id,
      searchProfileRunId: row.search_profile_run_id,
      searchProfileId: row.search_profile_id,
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
      receivables: row.receivables ?? [],
      confidence: Number(row.confidence ?? 0.5),
      candidateStatus: row.candidate_status,
      companyId: row.company_id ?? undefined,
      dedupeKey: row.dedupe_key ?? '',
      rawPayload: row.raw_payload ?? {},
      capturedAt: row.captured_at,
      promotedAt: row.promoted_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };`;
if (!source.includes(secondMap)) throw new Error('single candidate mapping anchor not found');
source = source.replace(secondMap, `    return mapCandidateRow(row);`);

fs.writeFileSync(path, source);
