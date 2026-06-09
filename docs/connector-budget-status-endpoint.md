# Connector Budget Status Endpoint

## Objetivo

Adicionar uma consulta operacional de budget para conectores pagos ou com limite rígido, começando pela Mais Retorno.

A regra do projeto para a Mais Retorno é:

- máximo de 500 requisições por mês;
- respeitar o limite sempre;
- consumir o máximo possível mensalmente, mas com pacing diário e priorização por lead score.

## Endpoint

```http
GET /api/connectors/budget/status?connectorCode=mais_retorno
```

Parâmetros:

| Campo | Obrigatório | Default | Descrição |
|---|---:|---|---|
| `connectorCode` | não | `mais_retorno` | Código do conector. |
| `periodMonth` | não | mês UTC atual | Formato `YYYY-MM`. |

## O que retorna

- `monthlyBudget`
- `usedRequests`
- `reservedRequests`
- `remainingRequests`
- `usagePct`
- `dailyPacingLimit`
- `daysRemainingInMonth`
- `decision`
- `nextAction`
- `recentEvents`
- `diagnostics`

## Decisão operacional

| Situação | Decisão | Ação |
|---|---|---|
| Sem Supabase | Supabase não configurado | Não consumir conector pago. |
| Sem saldo | Bloquear novas chamadas | Aguardar virada do mês ou aprovar aumento formal. |
| Pacing baixo | Usar apenas em leads prioritários | Rodar só nos maiores `lead_score`. |
| Saldo saudável | Pode consumir com pacing diário | Usar em enrichment e validação de leads. |

## Por que isso importa para originação

Conectores pagos não devem ser usados como fonte primária de descoberta. Eles devem entrar depois da qualification inicial para enriquecer leads com maior probabilidade de gerar operação real.

O budget guard permite:

1. evitar estouro de custo;
2. manter auditoria de consumo;
3. priorizar uso em leads com melhor score;
4. transformar limite mensal em disciplina operacional de originação.

## Smoke test pós-merge

```bash
curl "https://<dominio>/api/connectors/budget/status?connectorCode=mais_retorno"
```

Resultado esperado:

- HTTP 200 se Supabase e tabelas estiverem OK;
- HTTP 207 se a rota subir, mas faltar Supabase/tabelas;
- nunca deve expor API key;
- nunca deve chamar a API externa apenas para consultar status.
