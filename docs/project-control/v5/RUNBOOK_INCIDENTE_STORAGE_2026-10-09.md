# Runbook — Incidente de storage Neon (09/10/2026)

**Estado:** contido, aguardando aprovação da limpeza ("opção 1").
**Responsável pela execução:** Claude, com o SQL verbatim abaixo.
**Aprovação necessária:** Marcelo (ação destrutiva em produção).

## 1. O que aconteceu

| Hora (UTC) | Evento |
| --- | --- |
| 17:02 | `capital-market-ingestion.yml` disparado com `dataset=all` (run `37963355986`) na religação da onda A (decisão D-04). |
| 17:02–17:14 | 7 datasets gravam até 20 mil linhas **cada**: ~124 mil eventos + bronze + métricas + vínculos. |
| 17:14 | Job aborta: `could not extend file because project size limit (457 MB) has been exceeded`. |
| 17:15 | Os workflows da onda A (`capital-market-ingestion`, `capture`, `search-profile-discovery`) são desabilitados de novo. |
| 18:09 | O guard de crescimento marca `block_raw`: 455.344.128 bytes contra hard limit de 440.000.000. Escritas raw são recusadas (`database_growth_guard_block_raw`). |

**Causa raiz:** o preflight `check-neon-storage-budget.mjs` liberou 20.000 linhas, e o CLI aplicou esse teto **por dataset**, não por execução. A correção está na PR **#568** (orçamento por execução e teto pela folga de storage).

## 2. Volume gravado no incidente (≥ 2026-10-09 17:00 UTC)

| Dataset | events | bronze | metrics | links | Manter? |
| --- | ---: | ---: | ---: | ---: | --- |
| `cvm_fidc_monthly` | 15.652 | 15.652 | 0 | 0 | **Sim** (base dos cedentes FIDC, F2-02) |
| `cvm_fund_registry` | 20.000 | 20.000 | 18.569 | 0 | Não |
| `cvm_fii_monthly` | 20.000 | 20.000 | 9.637 | 0 | Não |
| `cvm_cri_monthly` | 20.000 | 20.000 | 0 | 0 | Não |
| `cvm_cra_monthly` | 19.970 | 19.970 | 5.288 | 0 | Não |
| `cvm_offers` | 14.666 | 14.667 | 8.914 | 5.617 | Não |
| `cvm_securitization_ots` | 13.993 | 13.993 | 1.798 | 13.993 | Não |

> Achado para a F2-02: `cvm_fidc_monthly` gerou 0 métricas e 0 vínculos de entidade, só eventos sem CNPJ de cedente. O arquivo lido foi `inf_mensal_fidc_tab_III_*.csv`. Antes de usar como base de cedentes, é preciso confirmar qual tabela do informe mensal traz os cedentes.

## 3. Limpeza ("opção 1") — executar só com aprovação

Ordem obrigatória por causa das FKs: `capital_market_entity_links` e `capital_market_metrics` dependem de `capital_market_events`.

### 3.1 Pré-checagem (somente leitura)

```sql
select pg_size_pretty(pg_database_size(current_database())) as db,
       (select count(*) from public.capital_market_events  where created_at  >= '2026-10-09 17:00:00+00' and dataset_code <> 'cvm_fidc_monthly') as events_to_delete,
       (select count(*) from public.bronze_historical_records where ingested_at >= '2026-10-09 17:00:00+00' and dataset_code <> 'cvm_fidc_monthly') as bronze_to_delete,
       (select count(*) from public.capital_market_metrics  where created_at  >= '2026-10-09 17:00:00+00' and dataset_code <> 'cvm_fidc_monthly') as metrics_to_delete,
       (select count(*) from public.capital_market_entity_links where created_at >= '2026-10-09 17:00:00+00' and dataset_code <> 'cvm_fidc_monthly') as links_to_delete;
```

Esperado: `events_to_delete = 108.629`, `bronze_to_delete = 108.630`, `metrics_to_delete = 44.206`, `links_to_delete = 19.610`.

### 3.2 Exclusão (uma transação)

```sql
begin;
delete from public.capital_market_entity_links
 where created_at >= '2026-10-09 17:00:00+00' and dataset_code <> 'cvm_fidc_monthly';
delete from public.capital_market_metrics
 where created_at >= '2026-10-09 17:00:00+00' and dataset_code <> 'cvm_fidc_monthly';
delete from public.capital_market_events
 where created_at >= '2026-10-09 17:00:00+00' and dataset_code <> 'cvm_fidc_monthly';
delete from public.bronze_historical_records
 where ingested_at >= '2026-10-09 17:00:00+00' and dataset_code <> 'cvm_fidc_monthly';
commit;
```

### 3.3 Devolver o espaço (fora de transação, uma por vez)

`DELETE` não reduz o arquivo; só `VACUUM FULL` reescreve a tabela. Cada comando toma lock exclusivo por alguns segundos.

```sql
vacuum full public.capital_market_entity_links;
vacuum full public.capital_market_metrics;
vacuum full public.capital_market_events;
vacuum full public.bronze_historical_records;
```

### 3.4 Pós-checagem

```sql
select pg_size_pretty(pg_database_size(current_database())) as db,
       private.refresh_database_growth_guard() ->> 'status' as guard;
```

Aceite: banco entre **80 e 100 MB** e guard `normal`.

## 4. Alternativas, se a opção 1 não for aprovada

| Opção | Efeito | Observação |
| --- | --- | --- |
| Neon pago (Launch) | Mantém tudo; 10 GB | Custo mensal; decisão comercial do Marcelo. |
| Restaurar `production` para 2026-10-09 16:59 UTC | Volta ao estado pré-incidente | Janela de histórico de 6 h: só até ~22:59 UTC de 09/10. Descarta também as escritas legítimas depois desse horário. |
| Não fazer nada | Banco travado em `block_raw` | Captura, discovery e materialização param de gravar. **Não recomendado.** |

## 5. Religar a onda A depois da limpeza

1. Mergear #568 (teto por execução) **antes** de religar `capital-market-ingestion.yml`.
2. Rodar `neon-free-budget-guard.yml` e conferir verde.
3. Seguir `RUNBOOK_ONDAS_CAPTURA.md`, começando por `capture.yml` e `search-profile-discovery.yml`, que gravam pouco.
4. Capital markets: disparar um dataset por vez (`dataset=cvm_company_fre`, depois `cvm_fidc_monthly`), nunca `all`.

## 6. Lições registradas

- Teto de linhas vale **por execução**, nunca por item de um loop (PR #568).
- O preflight precisa enxergar **bytes**, não só status do guard (PR #568, `headroomRows`).
- Dispatch manual de `dataset=all` fica proibido no `PROMPT_EXECUCAO_V5.md` até a #568 estar em produção.
