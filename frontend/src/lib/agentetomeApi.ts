import { fetchWithPolicy } from './http';
import { buildApiUrl } from './runtimeConfig';
import type { SessionData } from './types';

export type AgentetomeBlocker = {
  code: string;
  title: string;
  nextAction: string;
};

export type AgentetomeRuntimeStatus = {
  provider: 'agentetome';
  sourceCode: 'src_agentetome_api';
  status: 'real' | 'partial';
  health: 'healthy' | 'degraded';
  configured: boolean;
  secretMode: 'supabase_vault';
  automaticRefresh: boolean;
  activeTargets: number;
  parsedPackages: number;
  failedPackages: number;
  bronzeRows: number;
  fidcEvents: number;
  lastPackageAt: string | null;
  lastCheckAt: string | null;
  lastSuccessAt: string | null;
  latestReferenceDate: string | null;
  latestObservedAt: string | null;
  marketMapReady: boolean;
  scoreImpact: false;
  capabilities: string[];
  edgeFunctions: Record<string, string>;
  blockers: AgentetomeBlocker[];
  generatedAt: string;
};

export type AgentetomeRefreshResult = {
  status: 'queued' | 'failed' | 'real';
  provider?: string;
  operation?: string;
  pg_net_request_id?: number | string;
  token_expires_at?: string;
  trigger_type?: string;
  administrator?: string;
  raw_download_link_persisted?: false;
  error?: string;
};

export type AgentetomeValidationResult = {
  status: 'real' | 'partial' | 'failed';
  generatedAt: string;
  data?: Record<string, unknown>;
  error?: string;
  retryAfterSeconds?: number;
  metadata?: {
    requestFingerprint?: string;
    xmlBytes?: number;
    rawXmlPersisted: false;
    providerDiscardsXml: true;
    sentToCvm: false;
  };
};

type Envelope<T> = {
  status: 'real' | 'partial' | 'mock';
  generatedAt?: string;
  data?: T;
  error?: string;
  note?: string;
};

const authHeaders = (session: SessionData | null) => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
});

async function parseEnvelope<T>(response: Response): Promise<Envelope<T>> {
  const raw = await response.text();
  if (!raw.trim()) throw new Error(`Agentetome retornou resposta vazia (${response.status}).`);
  let payload: Envelope<T>;
  try { payload = JSON.parse(raw) as Envelope<T>; } catch { throw new Error(`Agentetome retornou resposta inválida (${response.status}).`); }
  if (!response.ok || !payload.data) throw new Error(payload.error ?? `Agentetome falhou com status ${response.status}.`);
  return payload;
}

export async function getAgentetomeRuntime(session: SessionData | null): Promise<AgentetomeRuntimeStatus> {
  const response = await fetchWithPolicy(buildApiUrl('/sources/agentetome'), { headers: authHeaders(session) }, { timeoutMs: 22_000, retries: 1 });
  return (await parseEnvelope<AgentetomeRuntimeStatus>(response)).data!;
}

export async function queueAgentetomeRefresh(
  session: SessionData | null,
  input: { administrator?: string; cut?: 'recente' | 'competencia'; competence?: string; format?: 'csv' | 'xlsx' } = {},
): Promise<AgentetomeRefreshResult> {
  const response = await fetchWithPolicy(buildApiUrl('/sources/agentetome/admin-export'), {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({
      admin: input.administrator ?? 'oliveira trust',
      corte: input.cut ?? 'recente',
      competencia: input.competence,
      formato: input.format ?? 'csv',
    }),
  }, { timeoutMs: 28_000 });
  return (await parseEnvelope<AgentetomeRefreshResult>(response)).data!;
}

export async function validateAgentetomeXml(
  session: SessionData | null,
  xmlBase64: string,
): Promise<AgentetomeValidationResult> {
  const response = await fetchWithPolicy(buildApiUrl('/sources/agentetome/validate-xml'), {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({ xmlBase64 }),
  }, { timeoutMs: 28_000 });
  const raw = await response.text();
  let payload: AgentetomeValidationResult;
  try { payload = JSON.parse(raw) as AgentetomeValidationResult; } catch { throw new Error(`Validação XML retornou resposta inválida (${response.status}).`); }
  if (![200, 422].includes(response.status)) throw new Error(payload.error ?? `Validação XML falhou com status ${response.status}.`);
  return payload;
}
