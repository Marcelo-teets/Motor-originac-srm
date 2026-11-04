import { microsoftGraphLookup, type MicrosoftProvider, type SourceLookup, type ExternalRecord } from './dealExternalSources.js';
import { normalizeSourceIntake } from './dealSourceInbox.js';

export type WatchRequest = SourceLookup & { confirmed: boolean };
export type WatchRecord = {
  owner_user_id: string;
  provider: MicrosoftProvider;
  external_id: string;
  context_id: string;
  status: 'active' | 'paused';
  last_fingerprint: string | null;
};

export const MAX_WATCHES_PER_RUN = 6;
/** Exact Microsoft record watches only, never folder/mailbox/channel discovery. */
export function normalizeWatchRequest(input: WatchRequest) {
  if (input.confirmed !== true) throw new Error('Consentimento explícito para monitorar este ID é obrigatório.');
  const lookup = microsoftGraphLookup(input);
  if (input.provider === 'teams' && input.driveId) throw new Error('Teams não aceita driveId.');
  if (input.provider === 'sharepoint' && input.chatId) throw new Error('SharePoint não aceita chatId.');
  if (['outlook_email','outlook_calendar'].includes(input.provider) && (input.chatId || input.driveId)) {
    throw new Error('Contexto adicional não permitido nesta fonte.');
  }
  return {
    provider:input.provider,
    external_id:input.externalId,
    context_id:input.provider === 'teams' ? input.chatId! : input.provider === 'sharepoint' ? input.driveId! : '',
    lookup,
  };
}
export function fingerprintOfRecord(record: ExternalRecord) {
  return normalizeSourceIntake({
    provider:record.provider,
    externalId:record.externalId,
    title:record.title,
    sourceRef:record.url,
    occurredAt:record.occurredAt,
    fingerprint:record.resourceFingerprint,
  }).content_sha256;
}
export function sourceHasChanged(previousHash: string | null, record: ExternalRecord) {
  return !previousHash || previousHash !== fingerprintOfRecord(record);
}
export function safeWatchFailureCode(error: unknown) {
  const status = (error as {statusCode?:unknown})?.statusCode;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 600) {
    return 'GRAPH_HTTP_' + status;
  }
  return 'SOURCE_FETCH_FAILED';
}
