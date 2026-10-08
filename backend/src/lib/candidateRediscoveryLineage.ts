export type ExistingCandidateLineageRow = {
  id: string;
  dedupe_key: string;
  candidate_status?: string | null;
  source_ref?: string | null;
  website?: string | null;
  normalized_domain?: string | null;
  cnpj?: string | null;
  legal_name?: string | null;
  source_url?: string | null;
  evidence_summary?: string | null;
  confidence?: number | string | null;
  raw_payload?: Record<string, unknown> | null;
};

export type RediscoveredCandidateObservation = {
  searchProfileRunId?: string;
  searchProfileId?: string;
  sourceRef: string;
  sourceUrl?: string;
  evidenceSummary?: string;
  website?: string;
  normalizedDomain?: string;
  cnpj?: string;
  legalName?: string;
  confidence?: number;
  dedupeKey: string;
  rawPayload: Record<string, unknown>;
};

export type RediscoveryCandidateUpdate = {
  id: string;
  source_ref?: string;
  website?: string;
  normalized_domain?: string;
  cnpj?: string;
  legal_name?: string;
  source_url?: string;
  evidence_summary?: string;
  confidence?: number;
  raw_payload: Record<string, unknown>;
  updated_at: string;
};

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

const asStringArray = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  : [];

const genericSourceRefs = new Set(['', 'unknown', 'google-news-rss', 'supabase-discovery-universe']);
const semanticKeys = [
  'candidate_role',
  'commercial_queue',
  'commercial_semantics_reason',
  'commercial_semantics_version',
  'commercial_semantics',
] as const;

export const buildRediscoveryCandidateUpdate = (
  existing: ExistingCandidateLineageRow,
  current: RediscoveredCandidateObservation,
  observedAt: string,
): RediscoveryCandidateUpdate | null => {
  if (existing.candidate_status === 'discarded' || existing.candidate_status === 'rejected') return null;
  if (!existing.id || !existing.dedupe_key || existing.dedupe_key !== current.dedupeKey) return null;

  const previousPayload = asRecord(existing.raw_payload);
  const previousRediscovery = asRecord(previousPayload.rediscovery);
  const currentPublisherAttribution = asRecord(current.rawPayload.publisherAttribution);
  const publisherMatched = currentPublisherAttribution.matched === true;
  const existingSourceRef = String(existing.source_ref ?? '');
  const currentSourceRef = String(current.sourceRef ?? '');
  const shouldPromoteSource = genericSourceRefs.has(existingSourceRef)
    && !genericSourceRefs.has(currentSourceRef)
    && publisherMatched;

  const missing = (value: unknown) => typeof value !== 'string' || !value.trim();
  const website = missing(existing.website) && current.website?.trim() ? current.website.trim() : undefined;
  const normalizedDomain = missing(existing.normalized_domain) && current.normalizedDomain?.trim()
    ? current.normalizedDomain.trim()
    : undefined;
  const cnpj = missing(existing.cnpj) && current.cnpj?.trim() ? current.cnpj.trim() : undefined;
  const legalName = missing(existing.legal_name) && current.legalName?.trim() ? current.legalName.trim() : undefined;
  const sourceUrl = missing(existing.source_url) && current.sourceUrl?.trim() ? current.sourceUrl.trim() : undefined;
  const evidenceSummary = missing(existing.evidence_summary) && current.evidenceSummary?.trim()
    ? current.evidenceSummary.trim()
    : undefined;
  const existingConfidence = Number(existing.confidence ?? 0);
  const currentConfidence = Number(current.confidence ?? 0);
  const confidence = Number.isFinite(currentConfidence) && currentConfidence > existingConfidence
    ? currentConfidence
    : undefined;
  const identityHydrated = Boolean(website || normalizedDomain || cnpj || legalName || sourceUrl || evidenceSummary || confidence);

  const corroboratingSources = Array.from(new Set([
    ...asStringArray(previousPayload.corroboratingSources),
    ...asStringArray(current.rawPayload.corroboratingSources),
    existingSourceRef,
    currentSourceRef,
  ].filter((value) => value && value !== 'unknown'))).slice(0, 12);

  const previousCount = Number(previousRediscovery.count ?? 0);
  const latestObservation = {
    version: 'v12',
    observedAt,
    searchProfileId: current.searchProfileId ?? null,
    searchProfileRunId: current.searchProfileRunId ?? null,
    sourceRef: current.sourceRef,
    sourceUrl: current.sourceUrl ?? null,
    evidenceSummary: current.evidenceSummary ?? null,
    website: current.website ?? null,
    normalizedDomain: current.normalizedDomain ?? null,
    cnpj: current.cnpj ?? null,
    legalName: current.legalName ?? null,
    confidence: current.confidence ?? null,
    identityEvidenceKind: current.rawPayload.identityEvidenceKind ?? null,
    publisherName: current.rawPayload.publisherName ?? null,
    publisherAttribution: current.rawPayload.publisherAttribution ?? null,
    entityNormalization: current.rawPayload.entityNormalization ?? null,
    relevanceGate: current.rawPayload.relevanceGate ?? null,
    commercialSemantics: current.rawPayload.commercial_semantics ?? null,
  };

  const rawPayload: Record<string, unknown> = {
    ...previousPayload,
    corroboratingSources,
    latestObservation,
    rediscovery: {
      ...previousRediscovery,
      version: 'v12',
      count: previousCount + 1,
      lastSeenAt: observedAt,
      lastSearchProfileId: current.searchProfileId ?? null,
      lastSearchProfileRunId: current.searchProfileRunId ?? null,
      lastSourceRef: current.sourceRef,
    },
  };

  if (current.rawPayload.publisherName !== undefined) rawPayload.publisherName = current.rawPayload.publisherName;
  if (current.rawPayload.publisherAttribution !== undefined) rawPayload.publisherAttribution = current.rawPayload.publisherAttribution;
  if (current.rawPayload.transportSourceRef !== undefined) rawPayload.transportSourceRef = current.rawPayload.transportSourceRef;
  if (identityHydrated) {
    rawPayload.identityHydration = {
      version: 'v13',
      observedAt,
      sourceRef: current.sourceRef,
      websiteAdded: Boolean(website),
      normalizedDomainAdded: Boolean(normalizedDomain),
      cnpjAdded: Boolean(cnpj),
      legalNameAdded: Boolean(legalName),
      sourceUrlAdded: Boolean(sourceUrl),
      evidenceSummaryAdded: Boolean(evidenceSummary),
      confidenceRaised: Boolean(confidence),
    };
  }
  for (const key of semanticKeys) {
    if (current.rawPayload[key] !== undefined) rawPayload[key] = current.rawPayload[key];
  }

  return {
    id: existing.id,
    ...(shouldPromoteSource ? { source_ref: currentSourceRef } : {}),
    ...(website ? { website } : {}),
    ...(normalizedDomain ? { normalized_domain: normalizedDomain } : {}),
    ...(cnpj ? { cnpj } : {}),
    ...(legalName ? { legal_name: legalName } : {}),
    ...(sourceUrl ? { source_url: sourceUrl } : {}),
    ...(evidenceSummary ? { evidence_summary: evidenceSummary } : {}),
    ...(confidence ? { confidence } : {}),
    raw_payload: rawPayload,
    updated_at: observedAt,
  };
};
