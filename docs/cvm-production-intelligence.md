# CVM Production Intelligence

## Objetivo

Transformar os dados oficiais e gratuitos da CVM em sinais operacionais de originação, mantendo o fluxo oficial do Motor:

```text
CVM CKAN
→ recurso vigente ZIP/CSV
→ bronze_historical_records
→ capital_market_events
→ capital_market_entity_links
→ capital_market_metrics
→ company_signals
→ qualification / patterns / score / ranking / pipeline
```

A implementação não cria stack paralela. O backend continua em Node + TypeScript, a persistência em Supabase e a operação em GitHub Actions.

## Datasets em produção

### Mercado de capitais e fundos

| Código | Pacote CVM | Cadência |
|---|---|---|
| `cvm_offers` | `oferta-distrib` | diária |
| `cvm_fund_registry` | `fi-cad` | diária |
| `cvm_fidc_monthly` | `fidc-doc-inf_mensal` | semanal |
| `cvm_cri_monthly` | `securit-doc-inf_mensal_cri` | semanal |
| `cvm_cra_monthly` | `securit-doc-inf_mensal_cra` | semanal |
| `cvm_fii_monthly` | `fii-doc-inf_mensal` | semanal |
| `cvm_securitization_ots` | `securit-doc-inf_mensal_ots` | semanal |
| `cvm_fund_documents` | `fi-doc-eventual` | semanal |

### Companhias abertas

| Código | Pacote CVM | Uso |
|---|---|---|
| `cvm_company_fre` | `cia_aberta-doc-fre` | estrutura de capital, valores mobiliários, riscos e governança |
| `cvm_company_itr` | `cia_aberta-doc-itr` | demonstrações trimestrais e mudança de funding |
| `cvm_company_dfp` | `cia_aberta-doc-dfp` | demonstrações anuais e comparáveis financeiros |

## Regra crítica de identidade

A plataforma não trata `emissor`, `securitizadora`, `devedor`, `originador`, `cedente` e `fundo` como a mesma entidade.

Papéis persistidos:

- `issuer`
- `securitizer`
- `debtor`
- `originator`
- `assignor`
- `fund`
- `administrator`
- `manager`
- `custodian`
- `coordinator`
- `fiduciary_agent`
- `auditor`

Somente `debtor`, `originator`, `assignor` e emissor corporativo são candidatos automáticos a `is_primary_origination_target`. Securitizadoras, fundos e prestadores permanecem no market map e não são promovidos como leads por engano.

## Métricas tipadas

A camada `capital_market_metrics` substitui a leitura ambígua de um único campo `volume`.

Principais métricas:

- `offer_amount`
- `issue_amount`
- `captured_amount`
- `outstanding_balance`
- `fund_nav`
- `receivables_balance`
- `delinquent_balance`
- `provision_balance`
- `subordinated_nav`
- `delinquency_ratio`
- `subordination_ratio`
- `cash_and_equivalents`
- `trade_receivables`
- `short_term_debt`
- `long_term_debt`
- `net_revenue`
- `operating_cash_flow`

Cada métrica preserva dataset, registro, hash, competência, escopo, coluna oficial e horário de observação.

## Sinais gerados

### Explícitos

- `capital_market_event`
- `capital_market_refinancing_window`

### Derivados de séries oficiais

- `fidc_portfolio_growth`
- `fidc_delinquency_deterioration`
- `subordination_pressure`
- `receivables_growth`
- `short_term_debt_growth`
- `structured_funding_expansion`
- `liquidity_pressure`
- `revenue_acceleration`
- `cash_flow_deterioration`

Os sinais são idempotentes e sempre preservam `capitalMarketSignalKey`, dataset, registro, métrica, competência anterior e atual, URL e evidência observada.

## Guardrails

1. A ausência de registro não é sinal positivo nem negativo.
2. Securitizadora não é tratada como devedor automaticamente.
3. Cedente identificado em informe não prova que ele seja cotista subordinado.
4. Métricas de DFP/ITR preferem demonstrações consolidadas quando disponíveis.
5. Somente contas financeiras relevantes para originação são normalizadas.
6. Recursos de metadados/dicionários são ignorados.
7. Um recurso inalterado é pulado por checkpoint e a execução continua `completed`.
8. Falha de um arquivo não apaga o último snapshot válido.
9. `service_role` fica somente em backend e jobs.
10. Tabelas expostas possuem RLS, grants explícitos e views `security_invoker`.

## Operação

### CLI

```bash
npm -C backend exec -- tsx src/cli/capitalMarkets.ts \
  --dataset cvm_offers,cvm_fidc_monthly,cvm_cri_monthly,cvm_cra_monthly \
  --max-rows 100000 \
  --trigger backfill \
  --require-delivery
```

Bases financeiras:

```bash
npm -C backend exec -- tsx src/cli/capitalMarkets.ts \
  --dataset cvm_company_fre,cvm_company_itr,cvm_company_dfp \
  --reference 2026 \
  --max-rows 100000 \
  --trigger backfill \
  --require-delivery
```

### GitHub Actions

- `Capital Market Ingestion`: ofertas e bases centrais.
- `CVM Production Intelligence`: OTS, documentos eventuais, FRE, ITR e DFP.

Os dois workflows compartilham o mesmo grupo de concorrência para impedir ingestões simultâneas.

## Verificação no Supabase

```sql
select *
from public.capital_market_delivery_health
order by dataset_code;

select dataset_code, count(*)
from public.capital_market_resource_checkpoints
group by dataset_code
order by dataset_code;

select dataset_code, entity_role, count(*)
from public.capital_market_entity_links
where content_hash is not null
group by dataset_code, entity_role
order by dataset_code, entity_role;

select metric_code, count(*), max(reference_date)
from public.capital_market_metrics
group by metric_code
order by metric_code;

select signal_type, count(*)
from public.company_signals
where metadata ? 'capitalMarketSignalKey'
group by signal_type
order by signal_type;
```

## Views operacionais

- `capital_market_company_intelligence_v1`: eventos, papéis e métricas por empresa.
- `capital_market_maturity_wall_v1`: vencimentos futuros e meses até maturidade.
- `capital_market_delivery_health`: saúde ponta a ponta por dataset.

## Critério de aceite

A fonte somente é `real/healthy` quando existe execução concluída, evento persistido, checkpoint, entrega reconciliada e, quando houver correspondência de CNPJ, vínculo com `companies` e sinal rastreável.
