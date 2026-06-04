# Connector Budget Guard Implementation

## Objetivo

Criar uma camada comum para controlar orçamento mensal de conectores externos, começando pela Mais Retorno.

## Arquivos

- `db/migrations/025_connector_usage_budget_guard.sql`
- `backend/src/services/connectorBudgetGuard.ts`

## Tabelas

### `connector_usage_budgets`

Controla orçamento por conector e mês.

Campos principais:

- `connector_code`
- `period_month`
- `monthly_budget`
- `used_requests`
- `reserved_requests`

### `connector_usage_events`

Registra cada decisão do guardrail.

Campos principais:

- `connector_code`
- `period_month`
- `event_type`
- `request_cost`
- `status`
- `metadata`

## Serviço

`ConnectorBudgetGuard.checkAndRecord(connectorCode, requestCost, metadata)` retorna:

- `allowed`
- `status`
- `monthlyBudget`
- `usedRequests`
- `remainingRequests`
- `dailyPacingLimit`
- `daysRemainingInMonth`
- `nextAction`

## Política para Mais Retorno

- `connectorCode`: `mais_retorno`
- budget padrão: `500` requests/mês
- env opcional: `MAIS_RETORNO_MONTHLY_BUDGET`
- chave real: `MAIS_RETORNO_API_KEY`, nunca versionada

## Critérios de aceite

- sem Supabase, o guardrail bloqueia consumo;
- com orçamento esgotado, bloqueia nova request;
- cada decisão gera evento auditável;
- cada request autorizada incrementa `used_requests`;
- o conector pode falhar isoladamente sem quebrar o runtime de captura.

## Próxima PR

Implementar o client real da Mais Retorno consumindo este guardrail antes de qualquer chamada externa.
