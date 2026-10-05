import { fetchWithPolicy } from './http';
import { buildApiUrl } from './runtimeConfig';
import type { SessionData } from './types';
import type { KnowledgeEmbeddingCoverage, KnowledgeSearchResponse } from './knowledgeSearchTypes';

export type KnowledgeSearchInput = {
  query: string;
  companyId?: string | null;
  limit?: number;
};

const readPayload = async (response: Response, label: string) => {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    throw new Error(`${label} retornou uma resposta inválida (${response.status}).`);
  }
};

export const knowledgeSearchApi = {
  search: async (
    session: SessionData | null,
    input: KnowledgeSearchInput,
  ): Promise<KnowledgeSearchResponse> => {
    if (!session?.access_token) throw new Error('Sessão autenticada necessária para Busca do Vault.');
    const query = input.query.trim();
    if (query.length < 2) throw new Error('Digite ao menos dois caracteres para pesquisar.');

    const response = await fetchWithPolicy(buildApiUrl('/api/knowledge/search'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        companyId: input.companyId || null,
        limit: input.limit ?? 12,
      }),
    }, { timeoutMs: 25_000 });

    const payload = await readPayload(response, 'Busca do Vault');
    if (!response.ok) {
      throw new Error(String(payload.error ?? payload.message ?? `Busca do Vault falhou com status ${response.status}.`));
    }
    return payload as KnowledgeSearchResponse;
  },

  getEmbeddingCoverage: async (
    session: SessionData | null,
  ): Promise<KnowledgeEmbeddingCoverage> => {
    if (!session?.access_token) throw new Error('Sessão autenticada necessária para Cobertura semântica.');
    const response = await fetchWithPolicy(buildApiUrl('/api/knowledge/rpc'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ functionName: 'knowledge_embedding_coverage', args: {} }),
    }, { timeoutMs: 15_000 });

    const payload = await readPayload(response, 'Cobertura semântica');
    if (!response.ok) {
      throw new Error(String(payload.message ?? payload.details ?? `Cobertura semântica falhou com status ${response.status}.`));
    }
    return payload as KnowledgeEmbeddingCoverage;
  },
};
