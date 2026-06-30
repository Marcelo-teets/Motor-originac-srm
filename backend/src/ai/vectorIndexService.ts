import { getSupabaseClient } from '../lib/supabase.js';
import { voyageEmbedding } from './voyageEmbeddingService.js';
import type { VectorRetriever } from './types.js';

export type VectorDocument = {
  id: string;
  content: string;
  companyId?: string;
};

export type VectorSearchResult = {
  id: string;
  content: string;
};

export class VectorIndexService implements VectorRetriever {
  private readonly client = getSupabaseClient();
  private readonly memoryDocuments = new Map<string, VectorDocument>();

  async upsertDocuments(docs: VectorDocument[]): Promise<void> {
    if (!docs.length) return;

    docs.forEach((doc) => this.memoryDocuments.set(doc.id, doc));

    if (!this.client) return;

    const embeddings = await voyageEmbedding.embedBatch(docs.map((doc) => doc.content));
    await this.client.upsert(
      'vector_documents',
      docs.map((doc, i) => ({
        id: doc.id,
        company_id: doc.companyId ?? null,
        content: doc.content,
        embedding: embeddings[i],
      })),
      'id',
    );
  }

  async search(query: string, topK = 5): Promise<VectorSearchResult[]> {
    const normalizedQuery = query.trim();
    const normalizedTopK = Math.max(1, Math.min(20, topK));
    if (!normalizedQuery) return [];

    if (this.client) {
      try {
        const queryEmbedding = await voyageEmbedding.embed(normalizedQuery);
        const rows = await this.client.rpc<Array<{ id: string; content: string }>>('match_vector_documents', {
          query_embedding: queryEmbedding,
          match_count: normalizedTopK,
        });

        if (Array.isArray(rows)) {
          return rows.map((row) => ({ id: row.id, content: row.content }));
        }
      } catch {
        // fallback local se rpc/pgvector indisponível
      }
    }

    return Array.from(this.memoryDocuments.values())
      .filter((doc) => doc.content.toLowerCase().includes(normalizedQuery.toLowerCase()))
      .slice(0, normalizedTopK)
      .map((doc) => ({ id: doc.id, content: doc.content }));
  }
}
