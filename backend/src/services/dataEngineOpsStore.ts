import { getSupabaseClient } from '../lib/supabase.js';

const memory = {
  engineRequests: [] as any[],
  learningEvents: [] as any[],
  sourceDocuments: [] as any[],
  codeImprovementProposals: [] as any[],
};

export class DataEngineOpsStore {
  private readonly client = getSupabaseClient();

  async saveEngineRequests(rows: any[]) {
    if (!rows.length) return [];
    if (!this.client) {
      memory.engineRequests.push(...rows);
      return rows;
    }
    return this.client.insert('engine_requests', rows);
  }

  async listEngineRequests(limit = 50) {
    if (!this.client) return memory.engineRequests.slice(-limit).reverse();
    return this.client.select('engine_requests', { select: '*', orderBy: { column: 'created_at', ascending: false }, limit });
  }

  async saveLearningEvents(rows: any[]) {
    if (!rows.length) return [];
    if (!this.client) {
      memory.learningEvents.push(...rows);
      return rows;
    }
    return this.client.insert('engine_learning_events', rows);
  }

  async listLearningEvents(limit = 50) {
    if (!this.client) return memory.learningEvents.slice(-limit).reverse();
    return this.client.select('engine_learning_events', { select: '*', orderBy: { column: 'created_at', ascending: false }, limit });
  }

  async saveSourceDocuments(rows: any[]) {
    if (!rows.length) return [];
    if (!this.client) {
      memory.sourceDocuments.push(...rows);
      return rows;
    }
    return this.client.upsert('source_documents', rows, 'id');
  }

  async listSourceDocuments(limit = 50) {
    if (!this.client) return memory.sourceDocuments.slice(-limit).reverse();
    return this.client.select('source_documents', { select: '*', orderBy: { column: 'observed_at', ascending: false }, limit });
  }

  async saveCodeImprovementProposals(rows: any[]) {
    if (!rows.length) return [];
    if (!this.client) {
      memory.codeImprovementProposals.push(...rows);
      return rows;
    }
    return this.client.insert('code_improvement_proposals', rows);
  }
}
