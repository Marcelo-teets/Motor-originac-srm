import { env } from '../lib/env.js';

const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
const MAX_BATCH_SIZE = 128;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;

export const VOYAGE_EMBEDDING_DIMENSIONS = 1536;

export class VoyageApiKeyMissingError extends Error {
  readonly code = 'voyage_api_key_missing';

  constructor() {
    super('VOYAGE_API_KEY is required to call Voyage AI embeddings.');
    this.name = 'VoyageApiKeyMissingError';
  }
}

export class VoyageEmbeddingError extends Error {
  readonly code = 'voyage_embedding_failed';
  readonly status?: number;
  readonly details?: string;
  readonly retriable: boolean;

  constructor(message: string, options?: { status?: number; details?: string; retriable?: boolean }) {
    super(message);
    this.name = 'VoyageEmbeddingError';
    this.status = options?.status;
    this.details = options?.details;
    this.retriable = options?.retriable ?? false;
  }
}

type ParsedEmbedding = {
  index: number;
  embedding: number[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toInteger = (value: unknown): number | null => {
  const parsed = toFiniteNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
};

const sleep = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

const normalizeText = (text: string) => {
  const trimmed = text.trim();
  return trimmed.length ? trimmed : ' ';
};

const getVoyageApiKey = () => {
  const apiKey = env.voyageApiKey.trim();
  if (!apiKey) throw new VoyageApiKeyMissingError();
  return apiKey;
};

const embeddingFromUnknown = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null;

  const embedding: number[] = [];
  for (const item of value) {
    const parsed = toFiniteNumber(item);
    if (parsed === null) return null;
    embedding.push(parsed);
  }

  return embedding;
};

const parseVoyageResponse = (payload: unknown, expectedCount: number): number[][] => {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new VoyageEmbeddingError('Voyage embeddings response is missing the data array.', {
      details: JSON.stringify(payload).slice(0, 500),
    });
  }

  const parsed: ParsedEmbedding[] = [];
  payload.data.forEach((item, position) => {
    if (!isRecord(item)) {
      throw new VoyageEmbeddingError('Voyage embeddings response contains an invalid data item.');
    }

    const embedding = embeddingFromUnknown(item.embedding);
    if (!embedding) {
      throw new VoyageEmbeddingError('Voyage embeddings response contains a non-numeric embedding.');
    }

    if (embedding.length !== VOYAGE_EMBEDDING_DIMENSIONS) {
      throw new VoyageEmbeddingError(
        `Voyage embedding dimension mismatch: expected ${VOYAGE_EMBEDDING_DIMENSIONS}, received ${embedding.length}.`,
      );
    }

    parsed.push({
      index: toInteger(item.index) ?? position,
      embedding,
    });
  });

  if (parsed.length !== expectedCount) {
    throw new VoyageEmbeddingError(
      `Voyage embeddings response count mismatch: expected ${expectedCount}, received ${parsed.length}.`,
    );
  }

  return parsed
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding);
};

const toVoyageEmbeddingError = (error: unknown): VoyageEmbeddingError => {
  if (error instanceof VoyageEmbeddingError) return error;

  return new VoyageEmbeddingError('Voyage embeddings request failed before receiving a response.', {
    details: error instanceof Error ? error.message : String(error),
    retriable: true,
  });
};

const requestVoyageEmbeddings = async (texts: string[], apiKey: string): Promise<number[][]> => {
  const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: 'document',
      truncation: true,
      output_dimension: VOYAGE_EMBEDDING_DIMENSIONS,
      output_dtype: 'float',
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new VoyageEmbeddingError(`Voyage embeddings request failed with ${response.status}.`, {
      status: response.status,
      details: bodyText,
      retriable: response.status === 429 || response.status >= 500,
    });
  }

  try {
    return parseVoyageResponse(bodyText ? JSON.parse(bodyText) as unknown : null, texts.length);
  } catch (error) {
    if (error instanceof VoyageEmbeddingError) throw error;
    throw new VoyageEmbeddingError('Voyage embeddings response was not valid JSON.', {
      status: response.status,
      details: bodyText,
    });
  }
};

const requestWithRetry = async (action: () => Promise<number[][]>): Promise<number[][]> => {
  let lastError: VoyageEmbeddingError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      const voyageError = toVoyageEmbeddingError(error);
      lastError = voyageError;

      if (!voyageError.retriable || attempt === MAX_ATTEMPTS) {
        throw voyageError;
      }

      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new VoyageEmbeddingError('Voyage embeddings request failed.');
};

export const embedBatch = async (texts: string[]): Promise<number[][]> => {
  if (!texts.length) return [];

  const apiKey = getVoyageApiKey();
  const embeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
    const batch = texts.slice(start, start + MAX_BATCH_SIZE).map(normalizeText);
    const batchEmbeddings = await requestWithRetry(() => requestVoyageEmbeddings(batch, apiKey));
    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
};

export const embedText = async (text: string): Promise<number[]> => {
  const [embedding] = await embedBatch([text]);
  if (!embedding) throw new VoyageEmbeddingError('Voyage embeddings response did not include the requested text.');
  return embedding;
};
