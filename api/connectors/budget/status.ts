import type { IncomingMessage, ServerResponse } from 'node:http';

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const parseUrl = (req: IncomingMessage) => {
  const host = getHeader(req, 'host') ?? 'localhost';
  return new URL((req as any).url ?? '/', `https://${host}`);
};

const supabaseKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const currentPeriodMonth = (date = new Date()) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const daysRemainingInMonth = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.max(1, lastDay - date.getUTCDate() + 1);
};

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeConnectorCode = (value: string | null) => {
  const normalized = String(value ?? 'mais_retorno').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
  return normalized || 'mais_retorno';
};

type BudgetRow = {
  connector_code?: string;
  period_month?: string;
  monthly_budget?: number;
  used_requests?: number;
  reserved_requests?: number;
  updated_at?: string;
};

type UsageEventRow = {
  event_type?: string;
  status?: string;
  request_cost?: number;
  created_at?: string;
  metadata?: Record<string, unknown>;
};

async function supabaseGet<T>(path: string): Promise<{ ok: boolean; data: T | null; error?: string }> {
  const baseUrl = process.env.SUPABASE_URL;
  const key = supabaseKey();
  if (!baseUrl || !key) return { ok: false, data: null, error: 'missing_supabase_env' };

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, data: null, error: `${response.status} ${body.slice(0, 180)}` };
  }

  return { ok: true, data: await response.json() as T };
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method && req.method !== 'GET') {
    writeJson(res, 405, { status: 'partial', error: 'Method not allowed' });
    return;
  }

  const url = parseUrl(req);
  const connectorCode = safeConnectorCode(url.searchParams.get('connectorCode'));
  const periodMonth = url.searchParams.get('periodMonth') || currentPeriodMonth();
  const defaultBudget = Math.max(0, Number(process.env.MAIS_RETORNO_MONTHLY_BUDGET ?? 500));

  const [budgetResult, eventsResult] = await Promise.all([
    supabaseGet<BudgetRow[]>(`connector_usage_budgets?connector_code=eq.${encodeURIComponent(connectorCode)}&period_month=eq.${encodeURIComponent(periodMonth)}&select=*&limit=1`),
    supabaseGet<UsageEventRow[]>(`connector_usage_events?connector_code=eq.${encodeURIComponent(connectorCode)}&period_month=eq.${encodeURIComponent(periodMonth)}&select=event_type,status,request_cost,metadata,created_at&order=created_at.desc&limit=25`),
  ]);

  if (!budgetResult.ok && budgetResult.error === 'missing_supabase_env') {
    writeJson(res, 207, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      data: {
        connectorCode,
        periodMonth,
        monthlyBudget: defaultBudget,
        usedRequests: 0,
        reservedRequests: 0,
        remainingRequests: defaultBudget,
        usagePct: 0,
        dailyPacingLimit: Math.max(1, Math.ceil(defaultBudget / daysRemainingInMonth())),
        daysRemainingInMonth: daysRemainingInMonth(),
        decision: 'Supabase não configurado',
        nextAction: 'Configurar SUPABASE_URL e service role antes de consumir conectores com orçamento rígido.',
        recentEvents: [],
      },
    });
    return;
  }

  const budget = budgetResult.data?.[0] ?? null;
  const monthlyBudget = toNumber(budget?.monthly_budget, defaultBudget);
  const usedRequests = toNumber(budget?.used_requests, 0);
  const reservedRequests = toNumber(budget?.reserved_requests, 0);
  const remainingRequests = Math.max(0, monthlyBudget - usedRequests - reservedRequests);
  const usagePct = monthlyBudget > 0 ? Math.round((usedRequests / monthlyBudget) * 100) : 100;
  const daysLeft = daysRemainingInMonth();
  const dailyPacingLimit = Math.max(0, Math.ceil(remainingRequests / daysLeft));
  const recentEvents = eventsResult.data ?? [];

  const status = budgetResult.ok ? 'real' : 'partial';
  const decision = remainingRequests <= 0
    ? 'Bloquear novas chamadas'
    : dailyPacingLimit <= 1
      ? 'Usar apenas em leads prioritários'
      : 'Pode consumir com pacing diário';
  const nextAction = remainingRequests <= 0
    ? 'Aguardar virada do mês ou aprovar aumento formal de budget.'
    : `Limitar consumo a ~${dailyPacingLimit} requisições/dia e priorizar empresas com maior lead score.`;

  writeJson(res, status === 'real' ? 200 : 207, {
    status,
    generatedAt: new Date().toISOString(),
    data: {
      connectorCode,
      periodMonth,
      monthlyBudget,
      usedRequests,
      reservedRequests,
      remainingRequests,
      usagePct,
      dailyPacingLimit,
      daysRemainingInMonth: daysLeft,
      lastUpdatedAt: budget?.updated_at ?? null,
      decision,
      nextAction,
      recentEvents,
      diagnostics: {
        budgetTableOk: budgetResult.ok,
        eventsTableOk: eventsResult.ok,
        budgetError: budgetResult.error ?? null,
        eventsError: eventsResult.error ?? null,
      },
    },
  });
}
