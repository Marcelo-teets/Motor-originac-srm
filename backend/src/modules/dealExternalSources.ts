import type { CaptureInput, DealSourceProvider, Materiality } from './dealCardIntelligence.js';

export type ConnectedProvider = 'fireflies' | 'outlook_email' | 'outlook_calendar' | 'teams' | 'sharepoint';
export type MicrosoftProvider = Exclude<ConnectedProvider, 'fireflies'>;
export type SourceLookup = { provider: MicrosoftProvider; externalId: string; chatId?: string; driveId?: string };
export type ExternalRecord = {
  provider: ConnectedProvider;
  externalId: string;
  title: string;
  occurredAt: string | null;
  url: string | null;
  excerpt: string;
  resourceFingerprint: string;
};

const limit = (value: unknown, length: number) => typeof value === 'string' ? value.trim().slice(0, length) : '';
const date = (value: unknown): string | null => {
  if (typeof value === 'number') {
    const ms = value < 100_000_000_000 ? value * 1_000 : value;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  if (typeof value === 'string' && value && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return null;
};
const plain = (value: unknown) => limit(value, 2600)
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
  .replace(/&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim();
const safeUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const allowed = [
      'fireflies.ai', 'microsoft.com', 'office.com', 'office365.com',
      'outlook.com', 'sharepoint.com', 'onedrive.com', '1drv.ms',
    ];
    if (!allowed.some((domain) => host === domain || host.endsWith('.' + domain))) return null;
    return url.toString();
  } catch { return null; }
};
const safeId = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 400 || /[\x00-\x1f]/.test(value)) {
    throw new Error(label + ' inválido.');
  }
  return encodeURIComponent(value);
};

/** All Graph paths are fixed; ids are always URI-encoded and never treated as URLs. */
export function microsoftGraphLookup(query: SourceLookup): { path: string; scope: string } {
  const id = safeId(query.externalId, 'externalId');
  switch (query.provider) {
    case 'outlook_email':
      return { path: `/me/messages/${id}?$select=id,subject,bodyPreview,receivedDateTime,lastModifiedDateTime,webLink,conversationId`, scope: 'Mail.Read' };
    case 'outlook_calendar':
      return { path: `/me/events/${id}?$select=id,subject,bodyPreview,start,end,webLink,lastModifiedDateTime`, scope: 'Calendars.Read' };
    case 'teams':
      return { path: `/me/chats/${safeId(query.chatId, 'chatId')}/messages/${id}`, scope: 'Chat.Read' };
    case 'sharepoint':
      return { path: `/drives/${safeId(query.driveId, 'driveId')}/items/${id}?$select=id,name,description,lastModifiedDateTime,webUrl,eTag,file,folder`, scope: 'Files.Read' };
    default:
      throw new Error('Fonte Microsoft não suportada.');
  }
}

/**
 * Minimized projection. Do not retain raw email/Teams/meeting contents in the
 * source record; excerpts are only used transiently to propose reviewable claims.
 */
export function projectExternalRecord(provider: ConnectedProvider, payload: Record<string, unknown>): ExternalRecord {
  const id = limit(payload.id, 400);
  if (!id) throw new Error('Fonte sem ID confiável.');
  const summary = payload.summary && typeof payload.summary === 'object'
    ? payload.summary as Record<string, unknown> : {};
  let title = '';
  let snippet = '';
  let occurredAt: string | null = null;
  let url: string | null = null;
  let version = '';

  if (provider === 'fireflies') {
    title = limit(payload.title, 220);
    snippet = plain([summary.overview, summary.short_summary].filter(x=>typeof x === 'string').join(' '));
    occurredAt = date(payload.date);
    url = safeUrl(payload.transcript_url);
    version = limit(payload.date, 64) + '|' + snippet;
  } else if (provider === 'outlook_email') {
    title = limit(payload.subject, 220);
    snippet = plain(payload.bodyPreview);
    occurredAt = date(payload.receivedDateTime);
    url = safeUrl(payload.webLink);
    version = limit(payload.lastModifiedDateTime, 64) + '|' + snippet;
  } else if (provider === 'outlook_calendar') {
    title = limit(payload.subject, 220);
    snippet = plain(payload.bodyPreview);
    const start = payload.start && typeof payload.start === 'object' ? payload.start as Record<string, unknown> : {};
    occurredAt = date(start.dateTime) ?? date(payload.lastModifiedDateTime);
    url = safeUrl(payload.webLink);
    version = limit(payload.lastModifiedDateTime, 64) + '|' + snippet;
  } else if (provider === 'teams') {
    const body = payload.body && typeof payload.body === 'object' ? payload.body as Record<string, unknown> : {};
    snippet = plain(body.content);
    title = limit(snippet, 120) || 'Mensagem Teams';
    occurredAt = date(payload.createdDateTime);
    // Teams deep links may be retrieved from webUrl, but only after verification.
    url = safeUrl(payload.webUrl);
    version = limit(payload.lastModifiedDateTime, 64) + '|' + snippet;
  } else if (provider === 'sharepoint') {
    title = limit(payload.name, 220);
    snippet = plain(payload.description);
    occurredAt = date(payload.lastModifiedDateTime);
    url = safeUrl(payload.webUrl);
    version = limit(payload.eTag, 180) + '|' + limit(payload.lastModifiedDateTime, 64);
  }
  return {
    provider, externalId: id, title: title || `Fonte ${provider}`, occurredAt,
    url, excerpt: snippet, resourceFingerprint: version,
  };
}

/** Advisory only: a single explicit currency amount in a fundraising context. */
export function proposeAmountClaim(text: string) {
  const normalized = plain(text);
  if (!/(capta(?:ç|c)[aã]o|funding|necessidade financeira|linha de cr[eé]dito|financiamento)/i.test(normalized)) return [];
  const matches = [...normalized.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)\s*(milh[oõ]es|milh[aã]o|mm|mi|mil)?\b/gi)];
  if (matches.length !== 1) return [];
  const [, raw, magnitude] = matches[0];
  const value = Number(raw.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return [];
  const multiplier = /^(milh|mm|mi)/i.test(magnitude ?? '') ? 1_000_000 : /^mil$/i.test(magnitude ?? '') ? 1000 : 1;
  const amount = value * multiplier;
  if (!Number.isSafeInteger(Math.round(amount))) return [];
  return [{
    field: 'requestedAmount', value: amount, claimType: 'hypothesis' as const,
    materiality: 'critical' as Materiality, confidence: 0.35,
  }];
}

/**
 * A source is imported ONLY on a named deal and by a human requester.
 * Observed amounts are hypotheses requiring review; no financial approval.
 */
export function captureFromExternal(record: ExternalRecord, opportunityId: string): CaptureInput {
  if (!opportunityId) throw new Error('Oportunidade obrigatória.');
  return {
    opportunityId,
    mappingApproved: true,
    provider: record.provider as DealSourceProvider,
    externalId: record.externalId,
    title: record.title,
    sourceRef: record.url,
    occurredAt: record.occurredAt,
    content: [record.resourceFingerprint, record.title, record.excerpt].join('|'),
    claims: record.provider === 'sharepoint' || record.provider === 'outlook_calendar'
      ? [] : proposeAmountClaim(record.excerpt),
  };
}

/**
 * Server-only Fireflies GraphQL adapter. No mailbox or transcript search.
 * Uses fixed single-transcript query with a preselected ID, bounded response.
 */
export async function fetchFirefliesById(id: string, key: string, fetcher: typeof fetch = fetch) {
  safeId(id, 'meetingId');
  if (!key.trim()) throw new Error('FIREFLIES_API_KEY não configurada.');
  const query = `query DealCardTranscript($id: String!) {
    transcript(id: $id) { id title date transcript_url
      summary { overview short_summary }
    }
  }`;
  const response = await fetcher('https://api.fireflies.ai/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { id } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Fireflies HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 200_000) throw new Error('Resposta Fireflies acima do limite.');
  const raw = await response.text();
  if (raw.length > 200_000) throw new Error('Resposta Fireflies acima do limite.');
  const data = JSON.parse(raw) as {
    data?: { transcript?: Record<string, unknown> | null };
    errors?: Array<{ message?: string }>;
  };
  if (data.errors?.length) throw new Error('Fireflies GraphQL retornou erro; verifique acesso e ID.');
  if (!data.data?.transcript || data.data.transcript.id !== id) throw new Error('Transcrição não localizada ou não autorizada.');
  return projectExternalRecord('fireflies', data.data.transcript);
}
