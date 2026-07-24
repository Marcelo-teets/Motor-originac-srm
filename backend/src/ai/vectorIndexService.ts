import { getSupabaseClient } from '../lib/supabase.js';
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

type LexicalSearchRow = {
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

    await this.client.upsert(
      'vector_documents',
      docs.map((doc) => ({
        id: doc.id,
        company_id: doc.companyId ?? null,
        content: doc.content,
        embedding: null,
        metadata: {
          source_table: 'vector_index_service',
          source_id: doc.id,
          embedding_status: 'pending_real_embedding',
          synthetic_embedding: false,
        },
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
        const rows = await this.client.rpc<LexicalSearchRow[]>('match_vector_documents_lexical', {
          query_text: normalizedQuery,
          match_count: normalizedTopK,
          company_id: null,
        });

        if (Array.isArray(rows)) {
          return rows.map((row) => ({ id: row.id, content: row.content }));
        }
      } catch {
        // Local text fallback remains available when Supabase retrieval is unavailable.
      }
    }

    return Array.from(this.memoryDocuments.values())
      .filter((doc) => doc.content.toLowerCase().includes(normalizedQuery.toLowerCase()))
      .slice(0, normalizedTopK)
      .map((doc) => ({ id: doc.id, content: doc.content }));
  }
}
