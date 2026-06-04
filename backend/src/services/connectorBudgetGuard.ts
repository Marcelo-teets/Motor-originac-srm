import { getSupabaseClient } from '../lib/supabase.js';

export type ConnectorBudgetDecision = {
  connectorCode: string;
  periodMonth: string;
  allowed: boolean;
  status: 'allowed' | 'blocked_budget_exhausted' | 'partial_no_supabase';
  monthlyBudget: number;
  usedRequests: number;
  remainingRequests: number;
  requestCost: number;
  dailyPacingLimit: number;
  daysRemainingInMonth: number;
  nextAction: string;
};

type BudgetRow = {
  id?: string;
  connector_code: string;
  period_month: string;
  monthly_budget: number;
  used_requests: number;
  reserved_requests?: number;
};

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

export class ConnectorBudgetGuard {
  constructor(private readonly defaultMonthlyBudget = Number(process.env.MAIS_RETORNO_MONTHLY_BUDGET ?? 500)) {}

  async checkAndRecord(connectorCode: string, requestCost = 1, metadata: Record<string, unknown> = {}): Promise<ConnectorBudgetDecision> {
    const periodMonth = currentPeriodMonth();
    const monthlyBudget = Math.max(0, this.defaultMonthlyBudget);
    const supabase = getSupabaseClient();

    if (!supabase) {
      return {
        connectorCode,
        periodMonth,
        allowed: false,
        status: 'partial_no_supabase',
        monthlyBudget,
        usedRequests: 0,
        remainingRequests: monthlyBudget,
        requestCost,
        dailyPacingLimit: monthlyBudget,
        daysRemainingInMonth: daysRemainingInMonth(),
        nextAction: 'Configurar Supabase antes de consumir conectores pagos ou com orçamento rígido.',
      };
    }

    const existing = await supabase.select('connector_usage_budgets', {
      select: '*',
      filters: [
        { column: 'connector_code', value: connectorCode },
        { column: 'period_month', value: periodMonth },
      ],
      limit: 1,
    }) as BudgetRow[];

    const budget = existing[0] ?? (await supabase.upsert('connector_usage_budgets', [{
      connector_code: connectorCode,
      period_month: periodMonth,
      monthly_budget: monthlyBudget,
      used_requests: 0,
      reserved_requests: 0,
    }], 'connector_code,period_month') as BudgetRow[])[0];

    const usedRequests = toNumber(budget?.used_requests, 0);
    const effectiveMonthlyBudget = toNumber(budget?.monthly_budget, monthlyBudget);
    const remainingRequests = Math.max(0, effectiveMonthlyBudget - usedRequests);
    const daysLeft = daysRemainingInMonth();
    const dailyPacingLimit = Math.max(1, Math.ceil(remainingRequests / daysLeft));
    const allowed = requestCost <= remainingRequests;
    const status: ConnectorBudgetDecision['status'] = allowed ? 'allowed' : 'blocked_budget_exhausted';

    await supabase.insert('connector_usage_events', [{
      connector_code: connectorCode,
      period_month: periodMonth,
      event_type: allowed ? 'request_allowed' : 'request_blocked',
      request_cost: requestCost,
      status,
      metadata: {
        ...metadata,
        usedRequests,
        remainingRequests,
        monthlyBudget: effectiveMonthlyBudget,
        dailyPacingLimit,
      },
    }]);

    if (allowed) {
      await supabase.update('connector_usage_budgets', {
        used_requests: usedRequests + requestCost,
        updated_at: new Date().toISOString(),
      }, [
        { column: 'connector_code', value: connectorCode },
        { column: 'period_month', value: periodMonth },
      ]);
    }

    return {
      connectorCode,
      periodMonth,
      allowed,
      status,
      monthlyBudget: effectiveMonthlyBudget,
      usedRequests: allowed ? usedRequests + requestCost : usedRequests,
      remainingRequests: allowed ? Math.max(0, remainingRequests - requestCost) : remainingRequests,
      requestCost,
      dailyPacingLimit,
      daysRemainingInMonth: daysLeft,
      nextAction: allowed
        ? 'Executar conector respeitando o budget mensal e priorizando leads de maior score.'
        : 'Bloquear chamada até virar o mês ou aumentar orçamento aprovado.',
    };
  }
}
