import { getSupabaseClient } from '../lib/supabase.js';

type AgentMemoryInput = {
  agentName: string;
  memoryType: string;
  companyId?: string;
  sourceRef?: string;
  importance?: number;
  payload?: Record<string, unknown>;
};

type AgentFeedbackInput = {
  agentName: string;
  companyId?: string;
  feedbackType: string;
  score?: number;
  note?: string;
  payload?: Record<string, unknown>;
};

type AgentImprovementInput = {
  agentName: string;
  improvementTitle: string;
  priority?: 'low' | 'medium' | 'high';
  rationale?: string;
  payload?: Record<string, unknown>;
};

export class AgentLearningService {
  private readonly client = getSupabaseClient();

  async recordMemory(input: AgentMemoryInput) {
    const row = {
      agent_name: input.agentName,
      memory_type: input.memoryType,
      company_id: input.companyId ?? null,
      source_ref: input.sourceRef ?? null,
      importance: input.importance ?? 0.5,
      payload: input.payload ?? {},
    };
    if (!this.client) return { id: `mem_${Date.now()}`, ...row };
    const [saved] = await this.client.insert('agent_memory', [row]);
    return saved;
  }

  async recordFeedback(input: AgentFeedbackInput) {
    const row = {
      agent_name: input.agentName,
      company_id: input.companyId ?? null,
      feedback_type: input.feedbackType,
      score: input.score ?? null,
      note: input.note ?? null,
      payload: input.payload ?? {},
    };
    if (!this.client) return { id: `fb_${Date.now()}`, ...row };
    const [saved] = await this.client.insert('agent_feedback', [row]);
    return saved;
  }

  async createImprovement(input: AgentImprovementInput) {
    const row = {
      agent_name: input.agentName,
      improvement_title: input.improvementTitle,
      priority: input.priority ?? 'medium',
      rationale: input.rationale ?? null,
      payload: input.payload ?? {},
    };
    if (!this.client) return { id: `imp_${Date.now()}`, status: 'open', ...row };
    const [saved] = await this.client.insert('agent_improvement_backlog', [row]);
    return saved;
  }

  async listRecentMemory(agentName?: string) {
    if (!this.client) return [];
    return this.client.select('agent_memory', {
      select: '*',
      orderBy: { column: 'created_at', ascending: false },
      limit: 50,
      filters: agentName ? [{ column: 'agent_name', operator: 'eq', value: agentName }] : undefined,
    });
  }

  async listImprovementBacklog() {
    if (!this.client) return [];
    return this.client.select('agent_improvement_backlog', {
      select: '*',
      orderBy: { column: 'updated_at', ascending: false },
      limit: 100,
    });
  }

  async learnFromExecution(input: {
    agentName: string;
    companyId?: string;
    success: boolean;
    note: string;
    payload?: Record<string, unknown>;
  }) {
    await this.recordMemory({
      agentName: input.agentName,
      companyId: input.companyId,
      memoryType: input.success ? 'successful_execution' : 'failed_execution',
      importance: input.success ? 0.65 : 0.8,
      payload: { note: input.note, ...(input.payload ?? {}) },
    });

    if (!input.success) {
      await this.createImprovement({
        agentName: input.agentName,
        improvementTitle: `Melhorar fluxo do agente ${input.agentName}`,
        priority: 'high',
        rationale: input.note,
        payload: input.payload ?? {},
      });
    }

    return { learned: true };
  }
}
