const MEDIA_RECENCY_VERSION = 1;
const DEFAULT_MAX_FUNDING_AGE_DAYS = 365;

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const parseDate = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};

const fundingClasses = new Set(['direct_funding_trigger', 'funding_plan_trigger']);

export type CandidateMediaRecencyResult = {
  stale: boolean;
  publishedAt: string | null;
  ageDays: number | null;
  maxAgeDays: number;
  version: number;
};

export const evaluateCandidateMediaRecency = (
  rawPayload: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
  maxAgeDays = DEFAULT_MAX_FUNDING_AGE_DAYS,
): CandidateMediaRecencyResult => {
  const commercialSemantics = asRecord(rawPayload?.commercial_semantics);
  const signalClass = String(commercialSemantics.signalClass ?? '');
  const published = parseDate(
    rawPayload?.publishedAt
      ?? rawPayload?.published_at
      ?? rawPayload?.datePublished
      ?? asRecord(rawPayload?.latestObservation).publishedAt,
  );

  if (!published || !fundingClasses.has(signalClass)) {
    return {
      stale: false,
      publishedAt: published?.toISOString() ?? null,
      ageDays: published ? Math.max(0, Math.floor((now.getTime() - published.getTime()) / 86_400_000)) : null,
      maxAgeDays,
      version: MEDIA_RECENCY_VERSION,
    };
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - published.getTime()) / 86_400_000));
  return { stale: ageDays > maxAgeDays, publishedAt: published.toISOString(), ageDays, maxAgeDays, version: MEDIA_RECENCY_VERSION };
};

export const applyCandidateMediaRecencyGuard = (
  rawPayload: Record<string, unknown>,
  now: Date = new Date(),
  maxAgeDays = DEFAULT_MAX_FUNDING_AGE_DAYS,
): Record<string, unknown> => {
  const result = evaluateCandidateMediaRecency(rawPayload, now, maxAgeDays);
  const semantics = asRecord(rawPayload.commercial_semantics);
  const originalSignalClass = String(semantics.signalClass ?? '');

  if (!result.stale) {
    return {
      ...rawPayload,
      commercial_recency_version: result.version,
      commercial_recency: {
        version: result.version,
        status: result.publishedAt ? 'current_or_undated' : 'date_unavailable',
        publishedAt: result.publishedAt,
        ageDays: result.ageDays,
        maxAgeDays: result.maxAgeDays,
        commercialSuppressed: false,
      },
    };
  }

  return {
    ...rawPayload,
    candidate_role: 'operating_company',
    commercial_queue: false,
    commercial_semantics_reason: 'stale_media_funding_signal',
    commercial_semantics: {
      ...semantics,
      signalClass: 'historical_funding_signal',
      reason: 'stale_media_funding_signal',
      originalSignalClass,
      explicitFundingNeed: false,
      automaticDecisionEligible: false,
    },
    commercial_recency_version: result.version,
    commercial_recency: {
      version: result.version,
      status: 'historical',
      publishedAt: result.publishedAt,
      ageDays: result.ageDays,
      maxAgeDays: result.maxAgeDays,
      originalSignalClass,
      commercialSuppressed: true,
      reason: 'published_funding_signal_older_than_commercial_recency_window',
    },
  };
};

export const CANDIDATE_MEDIA_RECENCY_VERSION = MEDIA_RECENCY_VERSION;
