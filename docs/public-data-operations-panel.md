# Painel operacional das fontes públicas

## Objetivo

Transformar o catálogo de fontes em um control plane operacional para originação. A página `Sources` passa a responder:

1. quais loaders estão saudáveis, aguardando, parciais ou bloqueados;
2. quando cada dataset rodou;
3. quantos recursos e linhas foram processados;
4. quantos registros aderiram aos CNPJs do Company Master;
5. quantos outputs e sinais chegaram ao motor;
6. qual bloqueio ou próxima ação precisa ser executada.

## Fluxo técnico

```text
public_dataset_runs
+ public_dataset_resource_checkpoints
+ public_company_records
+ monitoring_outputs
+ company_signals
+ source_catalog
+ companies
→ get_public_data_operations_snapshot()
→ GET /api/sources/public-operations
→ frontend/src/pages/SourcesPage.tsx
```

A agregação ocorre no PostgreSQL para evitar varredura de tabelas grandes dentro da função serverless.

## Endpoint

```text
GET /api/sources/public-operations
Authorization: Bearer <Supabase access token>
```

A rota valida o token no Supabase Auth antes de utilizar a service role para executar a RPC agregada.

## Estados operacionais

| Estado | Regra |
|---|---|
| `healthy` | última execução `completed` |
| `running` | execução em andamento |
| `attention` | última execução `partial` |
| `blocked` | última execução `failed` |
| `waiting` | dataset ainda sem execução persistida |

## Guardrail de verdade operacional

- Sem runs persistidas, o painel mostra o blocker real de secrets do GitHub Actions.
- Depois da primeira execução global, datasets ainda não executados passam a indicar apenas primeira coleta pendente.
- Ausência de registros aderentes não é apresentada como erro nem como sinal positivo.
- O painel não fabrica runs, matches, outputs ou sinais.

## Arquivos

- `db/migrations/059_public_data_operations_snapshot.sql`
- `backend/src/services/publicDataOperationsService.ts`
- `backend/src/services/publicDataOperationsService.test.ts`
- `api/public-data-operations.ts`
- `frontend/src/lib/publicDataOperationsApi.ts`
- `frontend/src/pages/SourcesPage.tsx`
- `vercel.json`

## Validação

```bash
npm -C backend run typecheck
npm -C backend exec -- tsx --test src/services/publicDataOperationsService.test.ts
npm -C frontend run build
```

Após o merge, aplicar a migration 059 e validar:

```sql
select public.get_public_data_operations_snapshot();
```
