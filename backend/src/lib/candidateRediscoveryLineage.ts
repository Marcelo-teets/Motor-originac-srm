export type ExistingCandidateLineageRow = {
  id: string;
  dedupe_key: string;
  candidate_status?: string | null;
  source_ref?: string | null;
  raw_payload?: Record<string, unknown> | null;
};

export type RediscoveredCandidateObservation = {
  searchProfileRunId?: string;
  searchProfileId?: string;
  sourceRef: string;
  sourceUrl?: string;
  evidenceSummary?: string;
  dedupeKey: string;
  rawPayload: Record<string, unknown>;
};

export type RediscoveryCandidateUpdate = {
  id: string;
  source_ref?: string;
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
    publisherName: current.rawPayload.publisherName ?? null,
    publisherAttribution: current.rawPayload.publisherAttribution ?? null,
    entityNormalization: current.rawPayload.entityNormalization ?? null,
    relevanceGate: current.rawPayload.relevanceGate ?? null,
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

  return {
    id: existing.id,
    ...(shouldPromoteSource ? { source_ref: currentSourceRef } : {}),
    raw_payload: rawPayload,
    updated_at: observedAt,
  };
};
