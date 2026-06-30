/**
 * VoyageEmbeddingService — Motor Originação SRM
 * Gera embeddings reais via Voyage AI (voyage-large-2, 1536 dims).
 * Compatível com o schema vector(1536) do Supabase.
 *
 * Variável de ambiente necessária:
 *   VOYAGE_API_KEY=pa-...
 *
 * Docs: https://docs.voyageai.com/reference/embeddings-api
 */

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-large-2';
const EMBEDDING_DIMENSION = 1536;

export class VoyageEmbeddingService {
  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.VOYAGE_API_KEY;
    if (!this.apiKey) {
      console.warn('[VoyageEmbeddingService] VOYAGE_API_KEY não configurada — embeddings serão mocks.');
    }
  }

  get isReal(): boolean {
    return Boolean(this.apiKey);
  }

  async embed(input: string): Promise<number[]> {
    if (!this.apiKey) return this.buildMockEmbedding(input);
    return this.embedBatch([input]).then((results) => results[0] ?? this.buildMockEmbedding(input));
  }

  async embedBatch(inputs: string[]): Promise<number[][]> {
    if (!this.apiKey || !inputs.length) {
      return inputs.map((text) => this.buildMockEmbedding(text));
    }

    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: VOYAGE_MODEL, input: inputs }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Voyage API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return payload.data.map((item) => item.embedding);
  }

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
}

export const voyageEmbedding = new VoyageEmbeddingService();
