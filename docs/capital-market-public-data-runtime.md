# Runtime de Dados Públicos de Mercado de Capitais

## Objetivo

Transformar dados oficiais gratuitos da CVM em uma camada operacional para detectar emissões e mudanças em Debêntures, CRI, CRA, FIDC e FII dentro do fluxo oficial do Motor.

```text
CVM CKAN
→ descoberta do recurso vigente
→ download ZIP/CSV
→ bronze_historical_records
→ capital_market_events
→ resolução de CNPJ
→ company_signals
→ qualification / patterns / score / ranking / pipeline
```

## Datasets implementados

| Código | Pacote CVM | Conteúdo | Cadência |
|---|---|---|---|
| `cvm_offers` | `oferta-distrib` | Ofertas públicas, incluindo debêntures, CRI, CRA, FIDC e FII | diária |
| `cvm_fund_registry` | `fi-cad` | Fundos, classes e subclasses | diária |
| `cvm_fidc_monthly` | `fidc-doc-inf_mensal` | Informes mensais de FIDC | semanal |
| `cvm_cri_monthly` | `securit-doc-inf_mensal_cri` | Informes mensais de CRI | semanal |
| `cvm_cra_monthly` | `securit-doc-inf_mensal_cra` | Informes mensais de CRA | semanal |
| `cvm_fii_monthly` | `fii-doc-inf_mensal` | Informes mensais de FII | semanal |

## Execução local

```bash
SUPABASE_URL="..." \
SUPABASE_SERVICE_ROLE_KEY="..." \
npm -C backend exec -- tsx src/cli/capitalMarkets.ts --dataset all --max-rows 250000
```

Competência específica:

```bash
npm -C backend exec -- tsx src/cli/capitalMarkets.ts \
  --dataset cvm_fidc_monthly \
  --reference 2026-06 \
  --trigger backfill \
  --max-rows 500000
```

## Operação no GitHub Actions

Use **Actions → Capital Market Ingestion → Run workflow**. O job diário executa automaticamente todos os datasets. Para backfill, escolha um dataset e informe `reference`.

Secrets necessários:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Persistência

### Bronze

A integração reutiliza `bronze_historical_records`, com deduplicação por `dataset_code + record_key`. O payload bruto e o hash são preservados para auditoria.

### Normalizado

`capital_market_events` concentra:

- tipo de instrumento;
- emissor e CNPJ;
- fundo e CNPJ;
- número da oferta, código do ativo e série;
- datas de referência, emissão e vencimento;
- volume e status;
- origem, arquivo e payload completo.

### Sinais

A função `sync_capital_market_company_signals` resolve o emissor contra `companies.cnpj` e cria sinais explícitos e idempotentes em `company_signals`.

## Guardrails

- uma coleta global por dataset, sem baixar o mesmo arquivo para cada empresa;
- ausência de chaves externas;
- `service_role` somente no backend/job;
- RLS habilitado nas tabelas novas;
- acesso de leitura apenas para usuários autenticados;
- deduplicação e lineage preservados;
- falha de um arquivo deixa o dataset como `partial`, sem apagar dados anteriores.
