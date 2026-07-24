import type { SessionData } from './types';
import type { KnowledgeEmbeddingCoverage, KnowledgeSearchResponse } from './knowledgeSearchTypes';

const env = import.meta.env;
const supabaseUrl = String(env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY ?? '');

export type KnowledgeSearchInput = {
  query: string;
  companyId?: string | null;
  limit?: number;
};

const requireRuntime = (session: SessionData | null) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Busca do Vault requer VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }
  if (!session?.access_token) {
    throw new Error('Sessão autenticada necessária para acessar o corpus institucional.');
  }
  return session.access_token;
};

export const knowledgeSearchApi = {
  search: async (
    session: SessionData | null,
    input: KnowledgeSearchInput,
  ): Promise<KnowledgeSearchResponse> => {
    const accessToken = requireRuntime(session);
    const query = input.query.trim();
    if (query.length < 2) throw new Error('Digite ao menos dois caracteres para pesquisar.');

    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-hybrid-search`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        companyId: input.companyId || null,
        limit: input.limit ?? 12,
      }),
    });

    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      throw new Error(`Busca do Vault retornou uma resposta inválida (${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(String(payload.error ?? payload.message ?? `Busca do Vault falhou com status ${response.status}.`));
    }

    return payload as KnowledgeSearchResponse;
  },

  getEmbeddingCoverage: async (
    session: SessionData | null,
  ): Promise<KnowledgeEmbeddingCoverage> => {
    const accessToken = requireRuntime(session);
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/knowledge_embedding_coverage`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      throw new Error(`Cobertura semântica retornou uma resposta inválida (${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(String(payload.message ?? payload.details ?? `Cobertura semântica falhou com status ${response.status}.`));
    }

    return payload as KnowledgeEmbeddingCoverage;
  },
};
