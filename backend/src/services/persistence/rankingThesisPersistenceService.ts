type RankingSnapshotInput = {
  companyId: string;
  position: number;
  qualificationScore: number;
  leadScore: number;
  rankingScore: number;
  qualificationScoreDelta?: number;
  leadScoreDelta?: number;
  triggerStrength?: number;
  sourceConfidence?: number;
  suggestedStructure?: string;
  rationale?: string;
  createdAt?: string;
};

type ThesisOutputInput = {
  companyId: string;
  thesisSummary: string;
  structureType?: string;
  marketMapSummary?: string;
  whyNow?: string;
  commercialAngle?: string;
  validationRisks?: string[];
  evidencePayload?: Record<string, unknown>;
  confidenceScore?: number;
  createdAt?: string;
};

type ScoreHistoryInput = {
  companyId: string;
  scoreType: string;
  previousValue?: number | null;
  currentValue: number;
  diff?: number | null;
  changedBy?: string;
  rationale?: string;
  sourceConfidence?: number;
  triggerStrength?: number;
  payload?: Record<string, unknown>;
  createdAt?: string;
};

type SupabaseLikeClient = {
  insert: (table: string, rows: unknown[]) => Promise<unknown>;
};

const nowIso = () => new Date().toISOString();

export class RankingThesisPersistenceService {
  constructor(private readonly client: SupabaseLikeClient) {}

  async persistRankingSnapshots(items: RankingSnapshotInput[]) {
    if (!items.length) return [];
    return this.client.insert('ranking_v2', items.map((item) => ({
      company_id: item.companyId,
      position: item.position,
      qualification_score: item.qualificationScore,
      lead_score: item.leadScore,
      ranking_score: item.rankingScore,
      qualification_score_delta: item.qualificationScoreDelta ?? 0,
      lead_score_delta: item.leadScoreDelta ?? 0,
      trigger_strength: item.triggerStrength ?? 0,
      source_confidence: item.sourceConfidence ?? 0,
      suggested_structure: item.suggestedStructure ?? null,
      rationale: item.rationale ?? null,
      created_at: item.createdAt ?? nowIso(),
      updated_at: item.createdAt ?? nowIso(),
    })));
  }

  async persistThesisOutputs(items: ThesisOutputInput[]) {
    if (!items.length) return [];
    return this.client.insert('thesis_outputs', items.map((item) => ({
      company_id: item.companyId,
      thesis_summary: item.thesisSummary,
      structure_type: item.structureType ?? null,
      market_map_summary: item.marketMapSummary ?? null,
      why_now: item.whyNow ?? null,
      commercial_angle: item.commercialAngle ?? null,
      validation_risks: item.validationRisks ?? [],
      evidence_payload: item.evidencePayload ?? {},
      confidence_score: item.confidenceScore ?? 0,
      created_at: item.createdAt ?? nowIso(),
      updated_at: item.createdAt ?? nowIso(),
    })));
  }

  async persistScoreHistory(items: ScoreHistoryInput[]) {
    if (!items.length) return [];
    return this.client.insert('score_history', items.map((item) => ({
      company_id: item.companyId,
      score_type: item.scoreType,
      previous_value: item.previousValue ?? null,
      current_value: item.currentValue,
      diff: item.diff ?? (item.previousValue == null ? null : item.currentValue - item.previousValue),
      changed_by: item.changedBy ?? 'system',
      rationale: item.rationale ?? null,
      source_confidence: item.sourceConfidence ?? null,
      trigger_strength: item.triggerStrength ?? null,
      payload: item.payload ?? {},
      created_at: item.createdAt ?? nowIso(),
    })));
  }
}
