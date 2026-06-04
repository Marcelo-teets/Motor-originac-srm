# Mais Retorno Budget Guard

## Objetivo

Preparar a integração da API Mais Retorno com limite mensal rígido de 500 requisições, usando o máximo possível do mês sem ultrapassar o teto.

## Regras obrigatórias

- Nunca versionar API key.
- Usar variável de ambiente para credencial.
- Não expor segredo no frontend.
- Não registrar segredo em logs.
- Bloquear requisição se o orçamento mensal estiver esgotado.
- Usar pacing diário para consumir o orçamento de forma eficiente.

## Variáveis de ambiente esperadas

- `MAIS_RETORNO_API_KEY`
- `MAIS_RETORNO_MONTHLY_BUDGET=500`

## Modelo de dados recomendado

### `connector_usage_budgets`

- `id`
- `connector_code`
- `period_month`
- `monthly_budget`
- `used_requests`
- `reserved_requests`
- `created_at`
- `updated_at`

### `connector_usage_events`

- `id`
- `connector_code`
- `period_month`
- `event_type`
- `request_cost`
- `status`
- `metadata`
- `created_at`

## Lógica de pacing

- Budget mensal: 500.
- Pacing diário base: orçamento restante dividido pelos dias restantes do mês.
- Permitir catch-up se dias anteriores usaram menos que o esperado.
- Bloquear quando `used_requests + request_cost > monthly_budget`.

## Uso no Motor Originação

A Mais Retorno deve entrar como fonte complementar para enriquecimento financeiro e de mercado, nunca como fonte primária de verdade.

Prioridade de uso:

1. empresas já qualificadas com maior lead score;
2. empresas com indício de FIDC, DCM, funding gap ou capital mismatch;
3. fontes oficiais primeiro, vendor enriquecendo depois.

## Critérios de aceite

- conector não executa sem env key;
- budget mensal nunca passa de 500;
- eventos de uso ficam persistidos;
- Source Health mostra status do conector;
- falha de budget não quebra o runtime geral, apenas marca o conector como parcial.
