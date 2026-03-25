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

const EMBEDDING_DIMENSION = 1536;

export class VectorIndexService implements VectorRetriever {
  private readonly client = getSupabaseClient();
  private readonly memoryDocuments = new Map<string, VectorDocument>();

  private buildMockEmbedding(input: string): number[] {
    const embedding = new Array<number>(EMBEDDING_DIMENSION).fill(0);
    let seed = 17;

    for (let i = 0; i < input.length; i += 1) {
      seed = (seed * 31 + input.charCodeAt(i)) % 2147483647;
    }

    for (let i = 0; i < embedding.length; i += 1) {
      seed = (seed * 48271) % 2147483647;
      embedding[i] = (seed / 2147483647) * 2 - 1;
    }

    return embedding;
  }

  async upsertDocuments(docs: VectorDocument[]): Promise<void> {
    if (!docs.length) return;

    docs.forEach((doc) => this.memoryDocuments.set(doc.id, doc));

    if (!this.client) {
      // TODO: integrar com Supabase em todos os ambientes após configurar variáveis de ambiente.
      return;
    }

    await this.client.upsert(
      'vector_documents',
      docs.map((doc) => ({
        id: doc.id,
        company_id: doc.companyId ?? null,
        content: doc.content,
        embedding: this.buildMockEmbedding(doc.content),
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
        const rows = await this.client.rpc<Array<{ id: string; content: string }>>('match_vector_documents', {
          query_embedding: this.buildMockEmbedding(normalizedQuery),
          match_count: normalizedTopK,
        });

        if (Array.isArray(rows)) {
          return rows.map((row) => ({ id: row.id, content: row.content }));
        }
      } catch {
        // fallback local caso rpc/pgvector ainda não estejam ativos.
      }
    }

    return Array.from(this.memoryDocuments.values())
      .filter((doc) => doc.content.toLowerCase().includes(normalizedQuery.toLowerCase()))
      .slice(0, normalizedTopK)
      .map((doc) => ({ id: doc.id, content: doc.content }));
  }
}
