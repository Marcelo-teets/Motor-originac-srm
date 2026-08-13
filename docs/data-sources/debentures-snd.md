# Debentures.com.br / SND

## Decisão

Integrar `debentures.com.br` como fonte governada do runtime de mercado de capitais, sem criar um pipeline paralelo.

O site é tratado como fonte **legada/confirmatória de infraestrutura de mercado** porque informa migração para o ANBIMA Data e risco de descontinuação. O conector, portanto, é isolado atrás do mesmo runtime usado pelos datasets CVM e sua falha não interrompe as demais fontes.

## Objetivo de originação

A fonte adiciona evidência observada para responder:

- a empresa já acessou DCM?
- já possui dívida estruturada pública?
- qual o histórico de emissões/debêntures?
- existe vencimento dentro da janela de 24 meses?
- qual o próximo momento plausível de refinanciamento?
- qual coordenador e agente fiduciário aparecem na estrutura?
- a emissão é incentivada pela Lei 12.431?

Guardrail: emissão registrada **não prova funding gap**. Ela aumenta evidência de acesso a mercado, funding público executado e executabilidade. Pressão de funding só pode ser inferida quando corroborada por outros sinais.

## Captura escolhida

Prioridade adotada: export bulk oficial do SND, e não scraping página a página.

Contrato de captura:

- dataset: `debentures_snd`
- source code: `src_debentures_snd`
- modo: `bulk_registered_snapshot`
- autenticação: anônima
- cadência: diária
- cron operacional: `0 14 * * *` UTC
- limite governado: 10.000 registros por execução
- parser: TSV legado com encoding Windows-1252, apesar da extensão histórica `.xls`
- idempotência: `record_key` por código do ativo + `content_hash` por linha normalizada
- checkpoint: `capital_market_resource_checkpoints`

## Probe de referência — 2026-08-13

O probe real validou o export de debêntures públicas registradas com:

- HTTP 200
- aproximadamente 2,8 MB
- 85 colunas
- 4.728 ativos/debêntures
- 4.728 CNPJs de emissor válidos
- 1.463 emissores únicos
- zero linhas com quantidade de colunas divergente
- 1.294 ativos marcados como incentivados pela Lei 12.431

Esses números são snapshot operacional e podem mudar a cada execução.

## Campos capturados

O raw payload preserva todas as colunas do export. A camada normalizada promove, entre outros:

- código do ativo
- empresa
- CNPJ do emissor
- série e emissão
- situação
- ISIN
- registro CVM da emissão
- data do registro CVM
- data da emissão
- vencimento original
- novo vencimento/saída, quando informado
- próxima repactuação
- quantidade emitida
- quantidade em mercado
- valor nominal na emissão
- valor nominal atual
- indexador
- tipo de remuneração
- critério de cálculo
- multiplicador/rentabilidade
- garantia/espécie
- classe
- coordenador líder
- agente fiduciário
- banco mandatário
- instituição depositária
- indicação Lei 12.431

Métricas derivadas explicitamente:

- `issued_quantity`
- `outstanding_quantity`
- `nominal_value_at_issue`
- `current_nominal_value`
- `issue_amount = quantidade emitida × valor nominal na emissão`
- `outstanding_balance = quantidade em mercado × valor nominal atual`
- `remuneration_multiplier`

As métricas derivadas são identificadas como cálculo do motor; os componentes originais permanecem preservados no raw payload.

## Fluxo integrado

```text
Debentures.com.br / SND bulk
  -> source_catalog
  -> capital-market resource adapter
  -> parser Windows-1252 / TSV
  -> normalização por ativo
  -> bronze_historical_records
  -> capital_market_events
  -> capital_market_entity_links
  -> capital_market_metrics
  -> resolução exata por CNPJ
  -> company_signals
  -> refinancing window (até 24 meses)
  -> source treatment + factor map
  -> qualification / patterns / score / ranking
  -> discovered_company_candidates para emissores ainda fora do Company Master
```

Nenhum candidato é promovido automaticamente para `companies`.

## Entity resolution

Ordem de confiança:

1. emissor por CNPJ: `1.00`
2. emissor por nome quando CNPJ faltar: `0.65`
3. coordenador/agente fiduciário por nome: `0.70`, sem ser target primário

O emissor é o `is_primary_origination_target=true`.

## Signals e fatores

`capital_market_event` alimenta:

- `dcm_market_access`
- `existing_public_funding`
- `public_funding_execution`

`capital_market_refinancing_window` alimenta:

- `debt_maturity_concentration`
- `capital_cycle_change`
- `dcm_market_access`

O tratamento marca os padrões:

- `capital_market_access`
- `existing_public_funding`
- `structured_debt`
- `debt_maturity_concentration`
- `refinancing_window`
- `capital_cycle_change`

## Convivência com CVM e ANBIMA

O SND não substitui CVM nem ANBIMA. A estratégia é de evidência complementar:

- CVM: registro/ofertas e demais datasets oficiais do runtime
- SND: características detalhadas por debênture e vencimentos
- ANBIMA Data: destino de continuidade da fonte quando a migração do site legado se completar

A deduplicação ocorre por entidade/CNPJ, código do ativo, record key e content hash. Signals podem coexistir quando representam evidências diferentes; o score não deve somar duplicidades sem tratamento.

## Resiliência e decommission

Falhas do SND devem:

1. marcar a fonte como `degraded/partial`;
2. preservar último checkpoint bem-sucedido;
3. não apagar eventos históricos;
4. não bloquear datasets CVM/ANBIMA;
5. manter o scheduler tentando novamente na próxima janela;
6. permitir troca do adapter para o ANBIMA Data sem alterar as tabelas downstream.

O conector HTTP aceita somente `https://www.debentures.com.br`, reduzindo superfície de SSRF.

## Arquivos principais

- `backend/src/modules/capital-markets/debenturesSndTypes.ts`
- `backend/src/modules/capital-markets/debenturesSndParser.ts`
- `backend/src/modules/capital-markets/debenturesSndNormalizer.ts`
- `backend/src/modules/capital-markets/debenturesSndHttp.ts`
- `backend/src/modules/capital-markets/capitalMarketResourceAdapter.ts`
- `backend/src/modules/capital-markets/cvmDatasetRegistry.ts`
- `backend/src/services/capitalMarketIngestionService.ts`
- `.github/workflows/capital-market-ingestion.yml`
- `db/migrations/130_debentures_snd_source_catalog.sql`
- `db/migrations/131_debentures_snd_signal_treatment.sql`
- `db/migrations/132_debentures_snd_candidate_delivery.sql`
- `db/migrations/133_debentures_snd_delivery_whitelist.sql`
