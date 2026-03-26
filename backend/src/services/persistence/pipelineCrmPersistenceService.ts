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

type PipelineStageHistoryInput = {
  pipelineId: string;
  companyId: string;
  fromStageCode?: string | null;
  toStageCode: string;
  changedBy?: string | null;
  note?: string | null;
  payload?: Record<string, unknown>;
};

type ActivityInput = {
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

type TaskInput = {
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

type SupabaseLikeClient = {
  upsert: (table: string, rows: unknown[], onConflict?: string) => Promise<unknown>;
  insert: (table: string, rows: unknown[]) => Promise<unknown>;
};

const nowIso = () => new Date().toISOString();

export class PipelineCrmPersistenceService {
  constructor(private readonly client: SupabaseLikeClient) {}

  async persistPipelineRows(items: PipelineRowInput[]) {
    if (!items.length) return [];
    return this.client.upsert('pipeline', items.map((item) => ({
      company_id: item.companyId,
      stage_code: item.stageCode,
      owner_name: item.ownerName ?? null,
      next_action: item.nextAction ?? null,
      next_action_due_at: item.nextActionDueAt ?? null,
      follow_up_at: item.followUpAt ?? null,
      status: item.status ?? 'open',
      source: item.source ?? null,
      payload: item.payload ?? {},
      updated_at: nowIso(),
    })), 'company_id');
  }

  async persistPipelineStageHistory(items: PipelineStageHistoryInput[]) {
    if (!items.length) return [];
    return this.client.insert('pipeline_stage_history', items.map((item) => ({
      pipeline_id: item.pipelineId,
      company_id: item.companyId,
      from_stage_code: item.fromStageCode ?? null,
      to_stage_code: item.toStageCode,
      changed_by: item.changedBy ?? 'system',
      note: item.note ?? null,
      payload: item.payload ?? {},
      created_at: nowIso(),
    })));
  }

  async persistActivities(items: ActivityInput[]) {
    if (!items.length) return [];
    return this.client.insert('activities', items.map((item) => ({
      company_id: item.companyId,
      owner_id: item.ownerId ?? null,
      title: item.title,
      activity_type: item.activityType ?? null,
      status: item.status ?? 'open',
      due_at: item.dueAt ?? null,
      follow_up_at: item.followUpAt ?? null,
      outcome: item.outcome ?? null,
      notes: item.notes ?? null,
      payload: item.payload ?? {},
      created_at: nowIso(),
    })));
  }

  async persistTasks(items: TaskInput[]) {
    if (!items.length) return [];
    return this.client.insert('tasks', items.map((item) => ({
      company_id: item.companyId,
      owner_id: item.ownerId ?? null,
      title: item.title,
      status: item.status ?? 'todo',
      due_at: item.dueAt ?? null,
      completed_at: item.completedAt ?? null,
      activity_id: item.activityId ?? null,
      priority: item.priority ?? 'medium',
      task_type: item.taskType ?? null,
      follow_up_at: item.followUpAt ?? null,
      payload: item.payload ?? {},
      created_at: nowIso(),
      updated_at: nowIso(),
    })));
  }
}
