import { createHash } from 'node:crypto';
import type { DealSourceProvider } from './dealCardIntelligence.js';

const PROVIDERS = new Set<DealSourceProvider>([
  'fireflies','teams','outlook_email','outlook_calendar',
  'sharepoint','client_folder','crm','manual',
]);

export type SourceIntakeInput = {
  provider: DealSourceProvider;
  externalId: string;
  title: string;
  sourceRef?: string | null;
  occurredAt?: string | null;
  fingerprint?: string | null;
  /** An unverified guess, never an automatic permission to attach. */
  suggestedDealId?: string | null;
};
export type IntakeNormalized = {
  provider: DealSourceProvider;
  external_id: string;
  title: string;
  source_ref: string | null;
  occurred_at: string | null;
  content_sha256: string;
  suggested_opportunity_id: string | null;
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const isUuid = (value: string | undefined | null) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const cleanText = (value: unknown, label: string, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
    /[\x00-\x1F\x7F]/.test(value)) throw new Error(label + ' inválido.');
  return value.trim();
};

/**
 * Privacy by design: never accept or store raw transcripts, message bodies,
 * attachments or emails in the source-inbox. Only stable metadata and hashes.
 * A Microsoft/Fireflies key is not consumed here.
 */
export function normalizeSourceIntake(input: SourceIntakeInput): IntakeNormalized {
  if (!PROVIDERS.has(input.provider)) throw new Error('Provedor de fonte não autorizado.');
  const external_id = cleanText(input.externalId, 'Identificador', 400);
  const title = cleanText(input.title, 'Título', 240);
  let source_ref: string | null = null;
  if (input.sourceRef) {
    if (input.sourceRef.length > 2048) throw new Error('Link de origem muito longo.');
    let url: URL;
    try { url = new URL(input.sourceRef); } catch { throw new Error('Link de origem inválido.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Link de origem deve ser HTTPS sem credenciais.');
    // Avoid persisting share links with opaque auth tokens or PII in query strings.
    url.search = '';
    url.hash = '';
    source_ref = url.toString();
  }
  const occurred_at = input.occurredAt
    ? (Number.isFinite(Date.parse(input.occurredAt)) ? new Date(input.occurredAt).toISOString() : null)
    : null;
  if (input.occurredAt && !occurred_at) throw new Error('Data da fonte inválida.');
  const fingerprint = input.fingerprint ? cleanText(input.fingerprint, 'Impressão da versão', 256) : '';
  const suggested_opportunity_id = input.suggestedDealId || null;
  if (suggested_opportunity_id && !isUuid(suggested_opportunity_id)) {
    throw new Error('Oportunidade sugerida inválida.');
  }
  // Keep the version stable across retries; do not hash receivedAt or user id.
  const content_sha256 = hash(JSON.stringify({
    provider: input.provider, external_id, title, source_ref, occurred_at, fingerprint,
  }));
  return { provider:input.provider,external_id,title,source_ref,occurred_at,content_sha256,suggested_opportunity_id };
}

/** Strictly declarative: no scoring algorithm is permitted to auto-link a deal. */
export function mustReviewIntakeResolution(status: string, action: string, note: string, dealId?: string | null) {
  if (status !== 'pending') throw new Error('Registro já foi decidido; reabertura deve gerar nova revisão.');
  if (!['link','ignore'].includes(action)) throw new Error('Decisão de triagem inválida.');
  if (note.trim().length < 10 || note.length > 2000) throw new Error('Justificativa de 10 a 2000 caracteres obrigatória.');
  if (action === 'link' && !dealId) throw new Error('Selecione uma oportunidade para vincular.');
  if (action === 'link' && !isUuid(dealId)) throw new Error('ID da oportunidade inválido.');
  if (action === 'ignore' && dealId) throw new Error('Descarte não pode vincular uma oportunidade.');
  return true;
}
