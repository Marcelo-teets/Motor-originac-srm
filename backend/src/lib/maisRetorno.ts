import { env } from './env.js';
import { getSupabaseClient } from './supabase.js';
import type { CompanySeed, SourceCatalogEntry } from '../types/platform.js';

const PROVIDER = 'mais_retorno';
const HARD_MONTHLY_CAP = 500;
const DEFAULT_TIMEOUT_MS = 12_000;

type ReservationMode = 'supabase' | 'memory';

export type MaisRetornoQuotaSnapshot = {
  provider: string;
  monthKey: string;
  monthlyQuota: number;
  softTarget: number;
  used: number;
  remaining: number;
  allowed: boolean;
  warning: boolean;
  mode: ReservationMode;
  reason?: string;
};

export type MaisRetornoConnectorResult = {
  status: 'real' | 'partial';
  title: string;
  summary: string;
  sourceUrl: string;
  payload: Record<string, unknown>;
  quota: MaisRetornoQuotaSnapshot;
};

const memoryUsage = new Map<string, number>();

const clampQuota = (value: number | string | undefined, fallback: number) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(HARD_MONTHLY_CAP, Math.floor(parsed));
};

const monthlyQuota = () => clampQuota(env.maisRetornoMonthlyQuota, HARD_MONTHLY_CAP);
const softTarget = () => Math.min(monthlyQuota(), clampQuota(env.maisRetornoMonthlyTarget, monthlyQuota()));

export const getMaisRetornoMonthKey = (date = new Date()) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

// Contrato de evidência: quota persistida no Supabase é `real`; contagem em
// memória/fallback nunca pode se declarar `real` (issue #126).
export const quotaEnvelopeStatus = (mode: ReservationMode): 'real' | 'partial' => (mode === 'supabase' ? 'real' : 'partial');

const reservationFromMemory = (purpose: string, reason?: string): MaisRetornoQuotaSnapshot => {
  const monthKey = getMaisRetornoMonthKey();
  const quota = monthlyQuota();
  const target = softTarget();
  const current = memoryUsage.get(monthKey) ?? 0;
  const allowed = current < quota;
  const used = allowed ? current + 1 : current;
  if (allowed) memoryUsage.set(monthKey, used);

  return {
    provider: PROVIDER,
    monthKey,
    monthlyQuota: quota,
    softTarget: target,
    used,
    remaining: Math.max(0, quota - used),
    allowed,
    warning: used >= Math.floor(quota * 0.8),
    mode: 'memory',
    reason: reason ?? (allowed ? purpose : 'monthly_quota_exhausted'),
  };
};

const statusFromMemory = (): MaisRetornoQuotaSnapshot => {
  const monthKey = getMaisRetornoMonthKey();
  const quota = monthlyQuota();
  const target = softTarget();
  const used = memoryUsage.get(monthKey) ?? 0;
  return {
    provider: PROVIDER,
    monthKey,
    monthlyQuota: quota,
    softTarget: target,
    used,
    remaining: Math.max(0, quota - used),
    allowed: used < quota,
    warning: used >= Math.floor(quota * 0.8),
    mode: 'memory',
  };
};

const normalizeReservation = (value: any, fallbackMode: ReservationMode): MaisRetornoQuotaSnapshot => {
  const quota = clampQuota(value?.monthlyQuota ?? value?.monthly_quota, HARD_MONTHLY_CAP);
  const used = Number(value?.usedAfter ?? value?.used_after ?? value?.used ?? value?.used_count ?? 0);
  return {
    provider: String(value?.provider ?? PROVIDER),
    monthKey: String(value?.monthKey ?? value?.month_key ?? getMaisRetornoMonthKey()),
    monthlyQuota: quota,
    softTarget: Math.min(quota, Number(value?.softTarget ?? value?.soft_target ?? quota)),
    used,
    remaining: Math.max(0, Number(value?.remaining ?? quota - used)),
    allowed: Boolean(value?.allowed ?? used < quota),
    warning: Boolean(value?.warning ?? used >= Math.floor(quota * 0.8)),
    mode: fallbackMode,
    reason: typeof value?.reason === 'string' ? value.reason : undefined,
  };
};

export async function reserveMaisRetornoRequest(purpose: string, sourceCode = 'src_mais_retorno_api') {
  const client = getSupabaseClient();
  if (!client) return reservationFromMemory(purpose, 'supabase_not_configured_memory_quota');

  try {
    const reserved = await client.rpc('reserve_external_api_request', {
      p_provider: PROVIDER,
      p_month_key: getMaisRetornoMonthKey(),
      p_monthly_quota: monthlyQuota(),
      p_soft_target: softTarget(),
      p_source_code: sourceCode,
      p_purpose: purpose,
    });
    return normalizeReservation(reserved, 'supabase');
  } catch (error) {
    return reservationFromMemory(purpose, `quota_rpc_fallback:${error instanceof Error ? error.message : 'unknown_error'}`);
  }
}

export async function getMaisRetornoQuotaStatus() {
  const client = getSupabaseClient();
  if (!client) return statusFromMemory();

  try {
    const monthKey = getMaisRetornoMonthKey();
    const rows = await client.select('external_api_usage_monthly', {
      select: '*',
      filters: [
        { column: 'provider', value: PROVIDER },
        { column: 'month_key', value: monthKey },
      ],
      limit: 1,
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      return {
        provider: PROVIDER,
        monthKey,
        monthlyQuota: monthlyQuota(),
        softTarget: softTarget(),
        used: 0,
        remaining: monthlyQuota(),
        allowed: true,
        warning: false,
        mode: 'supabase' as const,
      };
    }
    return normalizeReservation(row, 'supabase');
  } catch {
    return statusFromMemory();
  }
}

const metadataString = (source: SourceCatalogEntry, key: string) => {
  const value = source.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const buildSourceUrl = (baseUrl: string, path: string) => {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const relative = path.replace(/^\/+/, '');
  return new URL(relative, base).toString();
};

const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    /key|token|authorization|secret/i.test(key) ? '[redacted]' : redact(item),
  ]));
};

export async function fetchMaisRetornoMarketData(company: CompanySeed, source: SourceCatalogEntry): Promise<MaisRetornoConnectorResult | null> {
  const apiKey = env.maisRetornoApiKey;
  const baseUrl = env.maisRetornoApiBaseUrl || metadataString(source, 'baseUrl');
  const path = env.maisRetornoApiPath || metadataString(source, 'defaultPath') || 'mcp';

  if (!apiKey || !baseUrl) return null;

  const quota = await reserveMaisRetornoRequest('origination_market_data_enrichment', 'src_mais_retorno_api');
  if (!quota.allowed) {
    return {
      status: 'partial',
      title: `Mais Retorno quota · ${company.tradeName}`,
      summary: `Cota mensal Mais Retorno bloqueou a chamada: ${quota.used}/${quota.monthlyQuota} requisições usadas.`,
      sourceUrl: baseUrl,
      quota,
      payload: { provider: PROVIDER, skipped: true, reason: quota.reason ?? 'monthly_quota_exhausted', quota },
    };
  }

  const endpoint = buildSourceUrl(baseUrl, path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const requestPayload = {
    query: company.cnpj ? `Dados de mercado, fundos e comparáveis para ${company.tradeName} CNPJ ${company.cnpj}` : `Dados de mercado, fundos e comparáveis para ${company.tradeName}`,
    company: {
      tradeName: company.tradeName,
      legalName: company.legalName,
      cnpj: company.cnpj,
      segment: company.segment,
      subsegment: company.subsegment,
    },
    scope: ['fundos', 'indices', 'acoes', 'fiis', 'tesouro_direto'],
    useCase: 'origination_intelligence_platform',
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
      },
      body: JSON.stringify(requestPayload),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json') ? await response.json() : { text: await response.text() };

    return {
      status: response.ok ? 'real' : 'partial',
      title: `Mais Retorno API · ${company.tradeName}`,
      summary: response.ok
        ? `Consulta Mais Retorno executada para ${company.tradeName}. Quota usada: ${quota.used}/${quota.monthlyQuota}.`
        : `Consulta Mais Retorno retornou HTTP ${response.status}. Quota usada: ${quota.used}/${quota.monthlyQuota}.`,
      sourceUrl: endpoint,
      quota,
      payload: {
        provider: PROVIDER,
        endpoint,
        httpStatus: response.status,
        request: redact(requestPayload),
        data,
        quota,
      },
    };
  } catch (error) {
    return {
      status: 'partial',
      title: `Mais Retorno API · ${company.tradeName}`,
      summary: `Falha na consulta Mais Retorno para ${company.tradeName}: ${error instanceof Error ? error.message : 'unknown_error'}. Quota usada: ${quota.used}/${quota.monthlyQuota}.`,
      sourceUrl: endpoint,
      quota,
      payload: {
        provider: PROVIDER,
        endpoint,
        request: redact(requestPayload),
        error: error instanceof Error ? error.message : 'unknown_error',
        quota,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
