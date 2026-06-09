import type { ApiEnvelope, DataState, SessionData } from './types';
import { buildApiUrl } from './runtimeConfig';

export type ConnectorBudgetStatus = {
  connectorCode: string;
  periodMonth: string;
  monthlyBudget: number;
  usedRequests: number;
  reservedRequests: number;
  remainingRequests: number;
  usagePct: number;
  dailyPacingLimit: number;
  daysRemainingInMonth: number;
  lastUpdatedAt: string | null;
  decision: string;
  nextAction: string;
  recentEvents: Array<{
    event_type?: string;
    status?: string;
    request_cost?: number;
    created_at?: string;
    metadata?: Record<string, unknown>;
  }>;
  diagnostics?: {
    budgetTableOk: boolean;
    eventsTableOk: boolean;
    budgetError: string | null;
    eventsError: string | null;
  };
};

async function requestConnectorBudgetStatus(
  session: SessionData | null,
  connectorCode = 'mais_retorno',
): Promise<ApiEnvelope<ConnectorBudgetStatus>> {
  const response = await fetch(buildApiUrl(`/connectors/budget/status?connectorCode=${encodeURIComponent(connectorCode)}`), {
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  const payload = await response.json() as ApiEnvelope<ConnectorBudgetStatus> & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Falha ao carregar budget do conector.');
  return payload;
}

export async function getConnectorBudgetStatus(
  session: SessionData | null,
  connectorCode = 'mais_retorno',
): Promise<DataState<ConnectorBudgetStatus>> {
  try {
    const payload = await requestConnectorBudgetStatus(session, connectorCode);
    return {
      source: payload.status,
      note: payload.status === 'real'
        ? 'Budget de conector carregado do endpoint serverless com Supabase.'
        : 'Budget de conector carregado parcialmente; validar Supabase e migrations antes de consumir API paga.',
      data: payload.data,
    };
  } catch (error) {
    return {
      source: 'partial',
      note: error instanceof Error ? error.message : 'Budget indisponível no momento.',
      data: {
        connectorCode,
        periodMonth: new Date().toISOString().slice(0, 7),
        monthlyBudget: 500,
        usedRequests: 0,
        reservedRequests: 0,
        remainingRequests: 500,
        usagePct: 0,
        dailyPacingLimit: 1,
        daysRemainingInMonth: 1,
        lastUpdatedAt: null,
        decision: 'Budget não confirmado',
        nextAction: 'Não consumir chamadas pagas até validar o endpoint de budget no deploy.',
        recentEvents: [],
        diagnostics: {
          budgetTableOk: false,
          eventsTableOk: false,
          budgetError: 'frontend_fallback',
          eventsError: 'frontend_fallback',
        },
      },
    };
  }
}
