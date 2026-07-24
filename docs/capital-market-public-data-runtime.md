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
→ discovered_company_candidates
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

Os CLIs usam caminhos relativos ao workspace `backend`. Entre no diretório antes de executar:

```bash
cd backend
SUPABASE_URL="..." \
SUPABASE_SERVICE_ROLE_KEY="..." \
npm exec -- tsx src/cli/capitalMarkets.ts \
  --dataset all \
  --max-rows 100000 \
  --trigger manual \
  --require-delivery
```

Competência específica:

```bash
cd backend
npm exec -- tsx src/cli/capitalMarkets.ts \
  --dataset cvm_fidc_monthly \
  --reference 2026-06 \
  --trigger backfill \
  --max-rows 500000 \
  --require-delivery
```

Reprocessamento somente da camada de entrega, sem baixar novamente os arquivos:

```bash
cd backend
npm exec -- tsx src/cli/capitalMarketDelivery.ts \
  --dataset all \
  --require-delivery
```

## Operação no GitHub Actions

Use **Actions → Capital Market Ingestion → Run workflow**. O job diário executa `cvm_offers`; o job semanal executa cadastro de fundos e informes de FIDC, CRI, CRA e FII.

O workflow separa duas responsabilidades:

1. em pushes relacionados ao runtime CVM, executa typecheck, testes, canário, idempotência e probe do deploy exato;
2. em agendas e execuções manuais, prioriza a entrega dos dados e não permite que testes não relacionados do monorepo bloqueiem a captura.

O canal operacional alternativo é uma PR owner-only cujo título começa com `[OPS][CVM_BOOTSTRAP]`. O workflow ignora PRs comuns e, para o comando administrativo, executa todos os datasets com entrega obrigatória.

Quando a migration `092_cvm_delivery_hardening.sql` entra na `main`, o push executa um bootstrap único dos datasets atuais.

Secrets necessários:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` para o probe serverless em pushes

## Diagnóstico

Execuções não-push:

1. validam o acesso REST ao Supabase;
2. capturam stdout/stderr da CLI;
3. removem URL e secrets do log;
4. publicam um artifact sanitizado por sete dias;
5. preservam o exit code original.

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

### Entrega para originação

A função `sync_capital_market_delivery(dataset)` fecha o ciclo após cada ingestão:

1. resolve eventos contra `companies.cnpj`;
2. cria sinais explícitos e idempotentes em `company_signals`;
3. converte emissores CVM ainda não cadastrados em candidatos governados do Capture Inbox;
4. registra `signals_written` e `candidates_written` na execução;
5. atualiza a saúde da fonte no `source_catalog`;
6. expõe métricas por dataset em `capital_market_delivery_health`.

A promoção de candidatos para `companies` continua sujeita à revisão de identidade e aos gates de elegibilidade do projeto. Dado regulatório não autoriza score automático sem qualificação.

## Validação operacional

Após uma execução, validar:

```sql
select *
from public.capital_market_delivery_health
order by dataset_code;
```

Critérios mínimos:

- `delivery_status = 'healthy'`;
- `event_count > 0`;
- `checkpoint_count > 0` após execução incremental;
- `candidate_count > 0` para ofertas quando existirem emissores elegíveis não cadastrados;
- sinais apenas quando houver CNPJ correspondente em `companies`.

## Guardrails

- uma coleta global por dataset, sem baixar o mesmo arquivo para cada empresa;
- ausência de chaves externas;
- `service_role` somente no backend/job;
- RLS habilitado nas tabelas de persistência;
- acesso de leitura apenas para usuários autenticados;
- deduplicação e lineage preservados;
- falha de um arquivo deixa o dataset como `partial`, sem apagar dados anteriores;
- candidatos CVM não são promovidos automaticamente;
- sinais e score não devem confundir securitizadora, fundo, devedor e originador sem validação do papel da entidade.
