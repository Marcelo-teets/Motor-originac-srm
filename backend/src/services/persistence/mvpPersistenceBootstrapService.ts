import { PipelineCrmPersistenceService } from './pipelineCrmPersistenceService.js';
import { RankingThesisPersistenceService } from './rankingThesisPersistenceService.js';

type RankingRowInput = {
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

type ThesisRowInput = {
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

type ScoreHistoryRowInput = {
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

type PipelineRowInput = {
  companyId: string;
  stageCode: string;
  ownerName?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  followUpAt?: string | null;
  status?: string;
  source?: string | null;
  payload?: Record<string, unknown>;
};

type PipelineHistoryRowInput = {
  pipelineId: string;
  companyId: string;
  fromStageCode?: string | null;
  toStageCode: string;
  changedBy?: string | null;
  note?: string | null;
  payload?: Record<string, unknown>;
};

type ActivityRowInput = {
  companyId: string;
  ownerId?: string | null;
  title: string;
  activityType?: string | null;
  status?: string;
  dueAt?: string | null;
  followUpAt?: string | null;
  outcome?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
};

type TaskRowInput = {
  companyId: string;
  ownerId?: string | null;
  title: string;
  status?: string;
  dueAt?: string | null;
  completedAt?: string | null;
  activityId?: string | null;
  priority?: string;
  taskType?: string | null;
  followUpAt?: string | null;
  payload?: Record<string, unknown>;
};

type BootstrapPayload = {
  rankingRows?: RankingRowInput[];
  thesisRows?: ThesisRowInput[];
  scoreHistoryRows?: ScoreHistoryRowInput[];
  pipelineRows?: PipelineRowInput[];
  pipelineHistoryRows?: PipelineHistoryRowInput[];
  activityRows?: ActivityRowInput[];
  taskRows?: TaskRowInput[];
};

type SupabaseLikeClient = {
  upsert: (table: string, rows: unknown[], onConflict?: string) => Promise<unknown>;
  insert: (table: string, rows: unknown[]) => Promise<unknown>;
};

export class MvpPersistenceBootstrapService {
  private readonly pipelineCrmPersistenceService: PipelineCrmPersistenceService;
  private readonly rankingThesisPersistenceService: RankingThesisPersistenceService;

  constructor(client: SupabaseLikeClient) {
    this.pipelineCrmPersistenceService = new PipelineCrmPersistenceService(client);
    this.rankingThesisPersistenceService = new RankingThesisPersistenceService(client);
  }

  async persistAll(payload: BootstrapPayload) {
    const [rankingResult, thesisResult, scoreHistoryResult, pipelineResult, pipelineHistoryResult, activityResult, taskResult] = await Promise.all([
      this.rankingThesisPersistenceService.persistRankingSnapshots(payload.rankingRows ?? []),
      this.rankingThesisPersistenceService.persistThesisOutputs(payload.thesisRows ?? []),
      this.rankingThesisPersistenceService.persistScoreHistory(payload.scoreHistoryRows ?? []),
      this.pipelineCrmPersistenceService.persistPipelineRows(payload.pipelineRows ?? []),
      this.pipelineCrmPersistenceService.persistPipelineStageHistory(payload.pipelineHistoryRows ?? []),
      this.pipelineCrmPersistenceService.persistActivities(payload.activityRows ?? []),
      this.pipelineCrmPersistenceService.persistTasks(payload.taskRows ?? []),
    ]);

    return {
      rankingRows: Array.isArray(rankingResult) ? rankingResult.length : 0,
      thesisRows: Array.isArray(thesisResult) ? thesisResult.length : 0,
      scoreHistoryRows: Array.isArray(scoreHistoryResult) ? scoreHistoryResult.length : 0,
      pipelineRows: Array.isArray(pipelineResult) ? pipelineResult.length : 0,
      pipelineHistoryRows: Array.isArray(pipelineHistoryResult) ? pipelineHistoryResult.length : 0,
      activityRows: Array.isArray(activityResult) ? activityResult.length : 0,
      taskRows: Array.isArray(taskResult) ? taskResult.length : 0,
    };
  }
}
