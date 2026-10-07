import { getDataClient } from '../lib/dataClient.js';
import {
  applyCandidateCommercialSemantics,
  classifyCandidateCommercialSemantics,
  type CandidateCommercialSignalClass,
} from '../lib/candidateCommercialSemantics.js';
import { applyCandidateMediaRecencyGuard, CANDIDATE_MEDIA_RECENCY_VERSION } from '../lib/candidateMediaRecency.js';

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;
const SEMANTICS_VERSION = 3;

type CandidateRow = {
  id: string;
  company_name: string;
  source_ref: string | null;
  evidence_summary: string | null;
  candidate_status: string | null;
  raw_payload: Record<string, unknown> | null;
  updated_at: string | null;
};

type DataClient = NonNullable<ReturnType<typeof getDataClient>>;

type Dependencies = {
  client?: DataClient | null;
  now?: () => Date;
};

export type CandidateNewsSemanticsOptions = {
  limit?: number;
  force?: boolean;
};

export type CandidateNewsSemanticsResult = {
  status: 'completed' | 'no_targets';
  inspected: number;
  classified: number;
  directFunding: number;
  fundingPlans: number;
  creditExpansion: number;
  intermediaries: number;
  editorialNoiseDiscarded: number;
  relevantUnclassified: number;
  skippedCurrentVersion: number;
  errors: number;
};

const signalCounterKey = (signalClass: CandidateCommercialSignalClass) => {
  if (signalClass === 'direct_funding_trigger') return 'directFunding';
  if (signalClass === 'funding_plan_trigger') return 'fundingPlans';
  if (signalClass === 'credit_expansion_trigger') return 'creditExpansion';
  if (signalClass === 'market_intermediary_activity') return 'intermediaries';
  if (signalClass === 'editorial_noise') return 'editorialNoiseDiscarded';
  return 'relevantUnclassified';
};

export class CandidateNewsSemanticsService {
  private readonly client: DataClient | null;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies = {}) {
    this.client = dependencies.client === undefined ? getDataClient() : dependencies.client;
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(options: CandidateNewsSemanticsOptions = {}): Promise<CandidateNewsSemanticsResult> {
    if (!this.client) throw new Error('Neon data client not configured for candidate news semantics.');
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
    const rows = await this.client.select('discovered_company_candidates', {
      select: 'id,company_name,source_ref,evidence_summary,candidate_status,raw_payload,updated_at',
      filters: [
        { column: 'candidate_status', value: 'captured' },
        { column: 'raw_payload->>transportSourceRef', value: 'google-news-rss' },
      ],
      orderBy: { column: 'updated_at', ascending: false },
      limit,
    }) as CandidateRow[];

    if (!rows.length) {
      return {
        status: 'no_targets', inspected: 0, classified: 0, directFunding: 0,
        fundingPlans: 0, creditExpansion: 0, intermediaries: 0,
        editorialNoiseDiscarded: 0, relevantUnclassified: 0,
        skippedCurrentVersion: 0, errors: 0,
      };
    }

    const result: CandidateNewsSemanticsResult = {
      status: 'completed',
      inspected: rows.length,
      classified: 0,
      directFunding: 0,
      fundingPlans: 0,
      creditExpansion: 0,
      intermediaries: 0,
      editorialNoiseDiscarded: 0,
      relevantUnclassified: 0,
      skippedCurrentVersion: 0,
      errors: 0,
    };

    for (const row of rows) {
      try {
        const currentVersion = Number(row.raw_payload?.commercial_semantics_version ?? 0);
        const currentRecencyVersion = Number(row.raw_payload?.commercial_recency_version ?? 0);
        if (!options.force && currentVersion === SEMANTICS_VERSION && currentRecencyVersion === CANDIDATE_MEDIA_RECENCY_VERSION) {
          result.skippedCurrentVersion += 1;
          continue;
        }

        const input = {
          companyName: row.company_name,
          sourceRef: row.source_ref ?? 'google-news-rss',
          evidenceSummary: row.evidence_summary,
          rawPayload: row.raw_payload ?? {},
        };
        const semantics = classifyCandidateCommercialSemantics(input);
        if (!semantics) continue;

        const observedAt = this.now().toISOString();
        const guardedPayload = applyCandidateMediaRecencyGuard(applyCandidateCommercialSemantics(input), this.now());
        const rawPayload = {
          ...guardedPayload,
          classification_status: semantics.signalClass === 'editorial_noise'
            ? 'discarded_non_entity'
            : 'classified',
          classification_reason: semantics.reason,
          classification_version: SEMANTICS_VERSION,
          classification_observed_at: observedAt,
          ...(semantics.signalClass === 'editorial_noise'
            ? {
              discarded_reason: 'generic_editorial_subject_not_company',
              discarded_at: observedAt,
            }
            : {}),
        };

        await this.client.update('discovered_company_candidates', {
          ...(semantics.signalClass === 'editorial_noise' ? { candidate_status: 'discarded' } : {}),
          raw_payload: rawPayload,
          updated_at: observedAt,
        }, [{ column: 'id', value: row.id }]);

        result.classified += 1;
        const key = signalCounterKey(semantics.signalClass);
        result[key] += 1;
      } catch {
        result.errors += 1;
      }
    }

    return result;
  }
}
