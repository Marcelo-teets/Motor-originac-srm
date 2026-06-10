import { createHash } from 'node:crypto';

import { getSupabaseClient } from '../lib/supabase.js';
import { embedBatch } from './embeddingsService.js';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;

type CompanySignalRow = {
  id: string;
  companyId: string;
  sourceId: string | null;
  signalType: string;
  signalStrength: number;
  confidenceScore: number;
  evidencePayload: JsonValue;
  observedVsInferred: string | null;
  createdAt: string | null;
};

type ThesisOutputRow = {
  id: string;
  companyId: string;
  thesisSummary: string;
  structureType: string | null;
  marketMapSummary: string | null;
  confidenceScore: number | null;
  createdAt: string | null;
};

type SourceTable = 'company_signals' | 'thesis_outputs';

type SourceDocument = {
  sourceTable: SourceTable;
  sourceId: string;
  companyId: string;
  content: string;
  metadata: JsonObject;
  createdAt: string | null;
};

type ChunkDocument = {
  id: string;
  companyId: string;
  content: string;
  metadata: JsonObject;
  createdAt: string | null;
};

type VectorDocumentUpsertRow = {
  id: string;
  company_id: string;
  content: string;
  embedding: number[];
  metadata: JsonObject;
  created_at: string;
};

export type VectorIngestionResult = {
  companyId: string;
  sourceRows: number;
  chunks: number;
  documentsUpserted: number;
};

export class VectorIngestionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'VectorIngestionError';
    this.code = code;
  }
}

const CHUNK_TOKEN_TARGET = 800;
const CHUNK_TOKEN_OVERLAP = 100;
const CHUNK_TOKEN_STEP = CHUNK_TOKEN_TARGET - CHUNK_TOKEN_OVERLAP;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isPresent = <T>(value: T | null): value is T => value !== null;

const asRecords = (value: unknown): Record<string, unknown>[] => (
  Array.isArray(value) ? value.filter(isRecord) : []
);

const getString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === 'string' && value.length ? value : null;
};

const getNumber = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toJsonValue = (value: unknown): JsonValue => {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toJsonValue);

  if (isRecord(value)) {
    return Object.entries(value).reduce<JsonObject>((acc, [key, entry]) => {
      acc[key] = toJsonValue(entry);
      return acc;
    }, {});
  }

  return null;
};

const jsonToText = (value: JsonValue) => {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

const compactLines = (lines: Array<string | null>) => lines
  .filter((line): line is string => Boolean(line?.trim()))
  .join('\n');

const toCompanySignalRow = (record: Record<string, unknown>): CompanySignalRow | null => {
  const id = getString(record, 'id');
  const companyId = getString(record, 'company_id');
  if (!id || !companyId) return null;

  return {
    id,
    companyId,
    sourceId: getString(record, 'source_id'),
    signalType: getString(record, 'signal_type') ?? 'unknown_signal',
    signalStrength: getNumber(record, 'signal_strength') ?? 0,
    confidenceScore: getNumber(record, 'confidence_score') ?? 0,
    evidencePayload: toJsonValue(record.evidence_payload),
    observedVsInferred: getString(record, 'observed_vs_inferred'),
    createdAt: getString(record, 'created_at'),
  };
};

const toThesisOutputRow = (record: Record<string, unknown>): ThesisOutputRow | null => {
  const id = getString(record, 'id');
  const companyId = getString(record, 'company_id');
  const thesisSummary = getString(record, 'thesis_summary');
  if (!id || !companyId || !thesisSummary) return null;

  return {
    id,
    companyId,
    thesisSummary,
    structureType: getString(record, 'structure_type'),
    marketMapSummary: getString(record, 'market_map_summary'),
    confidenceScore: getNumber(record, 'confidence_score'),
    createdAt: getString(record, 'created_at'),
  };
};

const loadCompanySignals = async (client: SupabaseClient, companyId: string): Promise<CompanySignalRow[]> => {
  const rawRows: unknown = await client.select('company_signals', {
    select: '*',
    filters: [{ column: 'company_id', value: companyId }],
    orderBy: { column: 'created_at', ascending: false },
  });

  return asRecords(rawRows).map(toCompanySignalRow).filter(isPresent);
};

const loadThesisOutputs = async (client: SupabaseClient, companyId: string): Promise<ThesisOutputRow[]> => {
  const rawRows: unknown = await client.select('thesis_outputs', {
    select: '*',
    filters: [{ column: 'company_id', value: companyId }],
    orderBy: { column: 'created_at', ascending: false },
  });

  return asRecords(rawRows).map(toThesisOutputRow).filter(isPresent);
};

const signalToSourceDocument = (row: CompanySignalRow): SourceDocument => {
  const evidenceText = jsonToText(row.evidencePayload);
  const content = compactLines([
    'Tabela: company_signals',
    `Tipo de sinal: ${row.signalType}`,
    `Forca do sinal: ${row.signalStrength}`,
    `Confianca: ${row.confidenceScore}`,
    row.observedVsInferred ? `Natureza: ${row.observedVsInferred}` : null,
    evidenceText ? `Evidencia: ${evidenceText}` : null,
  ]);

  return {
    sourceTable: 'company_signals',
    sourceId: row.id,
    companyId: row.companyId,
    content,
    createdAt: row.createdAt,
    metadata: {
      source_table: 'company_signals',
      source_id: row.id,
      company_id: row.companyId,
      source_catalog_id: row.sourceId,
      signal_type: row.signalType,
      signal_strength: row.signalStrength,
      confidence_score: row.confidenceScore,
      observed_vs_inferred: row.observedVsInferred,
      source_created_at: row.createdAt,
    },
  };
};

const thesisToSourceDocument = (row: ThesisOutputRow): SourceDocument => {
  const content = compactLines([
    'Tabela: thesis_outputs',
    `Tese: ${row.thesisSummary}`,
    row.structureType ? `Estrutura sugerida: ${row.structureType}` : null,
    row.marketMapSummary ? `Mapa de mercado: ${row.marketMapSummary}` : null,
    row.confidenceScore === null ? null : `Confianca: ${row.confidenceScore}`,
  ]);

  return {
    sourceTable: 'thesis_outputs',
    sourceId: row.id,
    companyId: row.companyId,
    content,
    createdAt: row.createdAt,
    metadata: {
      source_table: 'thesis_outputs',
      source_id: row.id,
      company_id: row.companyId,
      structure_type: row.structureType,
      confidence_score: row.confidenceScore,
      source_created_at: row.createdAt,
    },
  };
};

const estimateTokens = (content: string) => content.trim().split(/\s+/).filter(Boolean).length;

const chunkText = (content: string): string[] => {
  const tokens = content.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  if (tokens.length <= CHUNK_TOKEN_TARGET) return [tokens.join(' ')];

  const chunks: string[] = [];
  for (let start = 0; start < tokens.length; start += CHUNK_TOKEN_STEP) {
    const end = Math.min(start + CHUNK_TOKEN_TARGET, tokens.length);
    chunks.push(tokens.slice(start, end).join(' '));
    if (end === tokens.length) break;
  }

  return chunks;
};

const deterministicUuid = (parts: string[]) => {
  const bytes = Buffer.from(createHash('sha1').update(parts.join('\u0000')).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const chunkSourceDocument = (document: SourceDocument): ChunkDocument[] => {
  const chunks = chunkText(document.content);

  return chunks.map((content, chunkIndex) => ({
    id: deterministicUuid([document.companyId, document.sourceTable, document.sourceId, String(chunkIndex)]),
    companyId: document.companyId,
    content,
    createdAt: document.createdAt,
    metadata: {
      ...document.metadata,
      chunk_index: chunkIndex,
      chunk_count: chunks.length,
      chunk_token_estimate: estimateTokens(content),
    },
  }));
};

const buildSourceDocuments = (signals: CompanySignalRow[], theses: ThesisOutputRow[]) => [
  ...signals.map(signalToSourceDocument),
  ...theses.map(thesisToSourceDocument),
].filter((document) => document.content.trim().length > 0);

export const ingestCompanyContext = async (companyId: string): Promise<VectorIngestionResult> => {
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCompanyId) {
    throw new VectorIngestionError('company_id_required', 'companyId is required for vector ingestion.');
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new VectorIngestionError('supabase_unavailable', 'Supabase service-role client is required for vector ingestion.');
  }

  const [signals, theses] = await Promise.all([
    loadCompanySignals(client, normalizedCompanyId),
    loadThesisOutputs(client, normalizedCompanyId),
  ]);

  const sourceDocuments = buildSourceDocuments(signals, theses);
  const chunks = sourceDocuments.flatMap(chunkSourceDocument);
  if (!chunks.length) {
    return {
      companyId: normalizedCompanyId,
      sourceRows: sourceDocuments.length,
      chunks: 0,
      documentsUpserted: 0,
    };
  }

  const embeddings = await embedBatch(chunks.map((chunk) => chunk.content));
  if (embeddings.length !== chunks.length) {
    throw new VectorIngestionError('embedding_count_mismatch', 'Embedding count did not match generated vector chunks.');
  }

  const now = new Date().toISOString();
  const rows: VectorDocumentUpsertRow[] = chunks.map((chunk, index) => ({
    id: chunk.id,
    company_id: chunk.companyId,
    content: chunk.content,
    embedding: embeddings[index],
    metadata: chunk.metadata,
    created_at: chunk.createdAt ?? now,
  }));

  await client.upsert('vector_documents', rows, 'id');

  return {
    companyId: normalizedCompanyId,
    sourceRows: sourceDocuments.length,
    chunks: chunks.length,
    documentsUpserted: rows.length,
  };
};
