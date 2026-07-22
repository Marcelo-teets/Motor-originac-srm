# Loaders públicos P0 — operação

## Objetivo

Transformar bases oficiais gratuitas em evidência company-level para originação, sem baixar arquivos nacionais dentro de requests da Vercel e sem persistir milhões de linhas sem aderência.

Fluxo:

```text
Fonte oficial
→ descoberta do recurso vigente
→ streaming CSV/ZIP
→ filtro pelos CNPJs do Company Master
→ bronze_historical_records
→ public_company_records
→ monitoring_outputs
→ company_signals
→ qualification / patterns / ranking
```

## Datasets implementados

| Dataset | Fonte | Sinal | Execução |
|---|---|---|---|
| `bndes_financing_operations` | CKAN BNDES | `public_financing_signal` | semanal |
| `pgfn_debt` | PGFN Dívida Ativa | `fiscal_stress` | mensal com checkpoint trimestral |
| `cgu_ceis` | Portal da Transparência CEIS | `legal_compliance_risk` | diária |
| `cgu_cnep` | Portal da Transparência CNEP | `legal_compliance_risk` | diária |
| `compras_contracts` | contratos públicos / fallback oficial | `public_contract_receivables` | semanal |
| `rfb_cnpj` | Receita Federal CNPJ | baseline cadastral; sinal apenas após diff | manual por competência |

## Guardrails

1. Somente CNPJs já presentes em `companies` são persistidos.
2. CNPJ raiz é usado apenas para Receita Federal e matriz/filiais.
3. Ausência de registro não é sinal positivo.
4. Receita Federal não gera trigger no primeiro snapshot.
5. Uma mudança RFB só gera `corporate_structure_change` quando o hash do snapshot mais recente difere do imediatamente anterior.
6. Checkpoints usam recurso, `etag`, `last-modified` e hash agregado.
7. Uma fonte só muda para `real` quando a execução declara `--full-coverage` e todos os recursos descobertos terminam sem erro.
8. Arquivos pesados rodam em GitHub Actions/Paperclip; Vercel não executa ingestão em lote.

## CLI

Os comandos abaixo partem da raiz do monorepo e entram explicitamente no backend.

Descobrir recursos sem baixar:

```bash
cd backend
npx tsx src/cli/publicBulkData.ts \
  --dataset bndes_financing_operations \
  --discover-only
```

Executar BNDES:

```bash
cd backend
npx tsx src/cli/publicBulkData.ts \
  --dataset bndes_financing_operations \
  --max-matched-rows 100000 \
  --max-resources 20 \
  --trigger manual \
  --full-coverage \
  --require-scan
```

Executar Receita por competência e partição controlada:

```bash
cd backend
npx tsx src/cli/publicBulkData.ts \
  --dataset rfb_cnpj \
  --reference 2026-01 \
  --max-resources 4 \
  --max-matched-rows 100000 \
  --trigger backfill \
  --require-scan
```

A Receita permanece com cobertura parcial até todos os arquivos `Empresas` e `Estabelecimentos` da competência terem checkpoint `completed`.

## Tabelas

- `public_dataset_runs`: execução, duração, cobertura e erros.
- `public_dataset_resource_checkpoints`: versão e estado de cada arquivo oficial.
- `public_company_records`: camada normalizada e aderente ao Company Master.
- `bronze_historical_records`: payload bruto e hash.
- `monitoring_outputs`: evidência operacional exibível.
- `company_signals`: impacto interpretável no motor.

## Workflow

Arquivo:

```text
.github/workflows/public-bulk-ingestion.yml
```

Cadências:

- CEIS/CNEP: diária;
- BNDES e contratos: semanal;
- PGFN: mensal, com checkpoint evitando repetição;
- Receita: manual por competência, por ser uma base nacional muito volumosa.

Secrets já utilizados pelo projeto:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

## Validação

```bash
npm -C backend run typecheck
cd backend
npx tsx --test src/modules/public-data/publicBulkDatasetConnector.test.ts
```

SQL operacional:

```sql
select dataset_code, status, started_at, finished_at,
       resources_processed, rows_scanned, records_matched,
       outputs_written, signals_written, error_message
from public.public_dataset_runs
order by started_at desc;
```

```sql
select dataset_code, resource_name, status, rows_scanned,
       records_matched, last_successful_run_at, error_message
from public.public_dataset_resource_checkpoints
order by last_checked_at desc;
```
