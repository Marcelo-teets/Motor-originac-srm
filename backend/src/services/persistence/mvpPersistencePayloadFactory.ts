type CompanyCommercialContext = {
  companyId: string;
  companyName: string;
  ownerName?: string | null;
  stageCode?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  followUpAt?: string | null;
  commercialStatus?: string | null;
  rationale?: string | null;
};

type RankingContext = {
  companyId: string;
  position: number;
  qualificationScore: number;
  leadScore: number;
  rankingScore: number;
  qualificationScoreDelta?: number;
  leadScoreDelta?: number;
  triggerStrength?: number;
  sourceConfidence?: number;
  suggestedStructure?: string | null;
  rationale?: string | null;
};

type ThesisContext = {
  companyId: string;
  thesisSummary: string;
  structureType?: string | null;
  marketMapSummary?: string | null;
  whyNow?: string | null;
  commercialAngle?: string | null;
  validationRisks?: string[];
  evidencePayload?: Record<string, unknown>;
  confidenceScore?: number;
};

type ScoreHistoryContext = {
  companyId: string;
  scoreType: string;
  previousValue?: number | null;
  currentValue: number;
  diff?: number | null;
  changedBy?: string | null;
  rationale?: string | null;
  sourceConfidence?: number;
  triggerStrength?: number;
  payload?: Record<string, unknown>;
};

type BootstrapPayload = {
  rankingRows: Array<Record<string, unknown>>;
  thesisRows: Array<Record<string, unknown>>;
  scoreHistoryRows: Array<Record<string, unknown>>;
  pipelineRows: Array<Record<string, unknown>>;
  pipelineHistoryRows: Array<Record<string, unknown>>;
  activityRows: Array<Record<string, unknown>>;
  taskRows: Array<Record<string, unknown>>;
};

const nowIso = () => new Date().toISOString();
const defaultStage = 'potenciais_interessados';

export class MvpPersistencePayloadFactory {
  build(input: {
    commercialContexts: CompanyCommercialContext[];
    rankingContexts: RankingContext[];
    thesisContexts: ThesisContext[];
    scoreHistoryContexts: ScoreHistoryContext[];
  }): BootstrapPayload {
    const rankingRows = input.rankingContexts.map((item) => ({
      companyId: item.companyId,
      position: item.position,
      qualificationScore: item.qualificationScore,
      leadScore: item.leadScore,
      rankingScore: item.rankingScore,
      qualificationScoreDelta: item.qualificationScoreDelta ?? 0,
      leadScoreDelta: item.leadScoreDelta ?? 0,
      triggerStrength: item.triggerStrength ?? 0,
      sourceConfidence: item.sourceConfidence ?? 0,
      suggestedStructure: item.suggestedStructure ?? null,
      rationale: item.rationale ?? null,
      createdAt: nowIso(),
    }));

    const thesisRows = input.thesisContexts.map((item) => ({
      companyId: item.companyId,
      thesisSummary: item.thesisSummary,
      structureType: item.structureType ?? null,
      marketMapSummary: item.marketMapSummary ?? null,
      whyNow: item.whyNow ?? null,
      commercialAngle: item.commercialAngle ?? null,
      validationRisks: item.validationRisks ?? [],
      evidencePayload: item.evidencePayload ?? {},
      confidenceScore: item.confidenceScore ?? 0,
      createdAt: nowIso(),
    }));

    const scoreHistoryRows = input.scoreHistoryContexts.map((item) => ({
      companyId: item.companyId,
      scoreType: item.scoreType,
      previousValue: item.previousValue ?? null,
      currentValue: item.currentValue,
      diff: item.diff ?? (item.previousValue == null ? null : item.currentValue - item.previousValue),
      changedBy: item.changedBy ?? 'system',
      rationale: item.rationale ?? null,
      sourceConfidence: item.sourceConfidence ?? null,
      triggerStrength: item.triggerStrength ?? null,
      payload: item.payload ?? {},
      createdAt: nowIso(),
    }));

    const pipelineRows = input.commercialContexts.map((item) => ({
      companyId: item.companyId,
      stageCode: item.stageCode ?? defaultStage,
      ownerName: item.ownerName ?? null,
      nextAction: item.nextAction ?? null,
      nextActionDueAt: item.nextActionDueAt ?? null,
      followUpAt: item.followUpAt ?? null,
      status: item.commercialStatus ?? 'open',
      source: 'mvp_persistence_payload_factory',
      payload: {
        companyName: item.companyName,
        rationale: item.rationale ?? null,
      },
    }));

    const pipelineHistoryRows = input.commercialContexts
      .filter((item) => item.stageCode)
      .map((item) => ({
        pipelineId: `pipeline_${item.companyId}`,
        companyId: item.companyId,
        fromStageCode: null,
        toStageCode: item.stageCode ?? defaultStage,
        changedBy: 'system',
        note: 'Initial MVP bootstrap stage registration',
        payload: {
          companyName: item.companyName,
        },
      }));

    const activityRows = input.commercialContexts
      .filter((item) => item.nextAction)
      .map((item) => ({
        companyId: item.companyId,
        ownerId: null,
        title: item.nextAction ?? 'Executar próxima ação comercial',
        activityType: 'next_step',
        status: 'open',
        dueAt: item.nextActionDueAt ?? null,
        followUpAt: item.followUpAt ?? null,
        outcome: null,
        notes: item.rationale ?? null,
        payload: {
          companyName: item.companyName,
          source: 'mvp_persistence_payload_factory',
        },
      }));

    const taskRows = input.commercialContexts
      .filter((item) => item.nextAction)
      .map((item) => ({
        companyId: item.companyId,
        ownerId: null,
        title: item.nextAction ?? 'Executar próxima ação comercial',
        status: 'todo',
        dueAt: item.nextActionDueAt ?? null,
        completedAt: null,
        activityId: null,
        priority: 'high',
        taskType: 'follow_up',
        followUpAt: item.followUpAt ?? null,
        payload: {
          companyName: item.companyName,
          stageCode: item.stageCode ?? defaultStage,
          source: 'mvp_persistence_payload_factory',
        },
      }));

    return {
      rankingRows,
      thesisRows,
      scoreHistoryRows,
      pipelineRows,
      pipelineHistoryRows,
      activityRows,
      taskRows,
    };
  }
}
