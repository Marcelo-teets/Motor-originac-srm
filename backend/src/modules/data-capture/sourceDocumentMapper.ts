import type { CanonicalSourceDocument } from './types.js';

export const mapSourceDocumentForStorage = (doc: CanonicalSourceDocument) => ({
  id: doc.id,
  company_id: doc.companyId,
  source_id: doc.sourceId,
  document_type: doc.documentType,
  external_id: doc.externalId,
  canonical_url: doc.canonicalUrl,
  title: doc.title,
  published_at: doc.publishedAt,
  observed_at: doc.observedAt,
  content_hash: doc.contentHash,
  raw_payload: doc.rawPayload,
  normalized_payload: doc.normalizedPayload,
  extraction_status: doc.extractionStatus,
});

export const mapSourceDocumentsForStorage = (docs: CanonicalSourceDocument[]) => docs.map(mapSourceDocumentForStorage);
