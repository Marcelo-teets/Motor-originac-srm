# Smoke de persistência de captura (issue #128)

Valida o critério de aceite do issue #128: uma execução real de captura deve gravar **e conseguir ler** `source_connector_runs`, `source_documents`, `monitoring_outputs`, `company_signals` e `enrichments` usando os IDs canônicos do runtime.

## O que o script faz

1. (Opcional) Dispara uma captura real via `GET {SMOKE_API_URL}/data-capture/run` autenticada com `CRON_SECRET`.
2. Lê as 5 linhas mais recentes de cada tabela operacional via Supabase REST.
3. Classifica o shape dos IDs gravados (`uuid`, `runtime_text` como `cmp_*`/`src_*`, `other_text`, `null`) para diagnosticar o drift uuid × text.
4. Amostra `companies.id` e `source_catalog.id` para expor o contrato de identidade vigente no banco vivo.
5. Falha se alguma tabela estiver ilegível ou vazia após a captura.

## Como rodar

```bash
SUPABASE_URL=https://<projeto>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role> \
SMOKE_API_URL=https://motor-originac-srm-marcelo-teets-projects.vercel.app/api \
CRON_SECRET=<cron_secret> \
node scripts/smoke/capture-persistence-smoke.mjs
```

Sem `SMOKE_API_URL`/`CRON_SECRET`, o script não dispara captura nova e apenas audita o que já está persistido.

## Interpretação

- `idShapes` com `runtime_text` em tabelas cujo schema vivo é `uuid` (ou colunas sempre `null`) confirma o drift do issue #128 — a migration de alinhamento deve ser escrita **a partir deste diagnóstico**, não do mirror local.
- `identityContract` mostra o tipo real de `companies.id` e `source_catalog.id` em produção; é a fonte de verdade para definir o contrato canônico antes de qualquer DDL.
- Tabela legível porém vazia após uma captura disparada indica gravação rejeitada silenciosamente (provável FK/tipo incompatível).

## Resultado do diagnóstico no banco vivo (2026-07-13)

Executado contra o projeto Supabase `hdghpmssudrqhsbvrdyt` via MCP:

- **O drift uuid × text não existe**: `companies.id`, `source_catalog.id` e todas as colunas de captura são `uuid`; o runtime resolve os códigos canônicos (`src_*` em `source_catalog.metadata->>'code'`) para uuids antes de persistir.
- **Volume real**: 783 runs, 5.520 documentos, 10.704 outputs, 12.707 sinais, 3.065 enrichments. `company_id` presente em ~100% das linhas.
- **Defeito real encontrado**: o mapper de sinais não gravava a coluna `source_id` (uuid ficava só em `metadata.source_id`) — 0% de linhagem de fonte em `company_signals`.
- **Correção aplicada**: coluna incluída no mapper + backfill (`032_company_signals_source_lineage_backfill.sql`) recuperando 11.985/12.707 sinais (94,3%); os 722 restantes não têm metadata recuperável.
- `source_connector_runs.source_id` nulo é correto: todos os runs são `scope_type='global'`.
