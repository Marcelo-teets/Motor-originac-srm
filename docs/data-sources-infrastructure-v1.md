# Data Sources Infrastructure v1

## Objetivo

Aplicar o mapa de fontes do Motor Originação SRM como infraestrutura operacional, sem criar stack paralela.

## Arquivos desta entrega

- `db/migrations/023_data_source_infrastructure_v1.sql`
- `backend/src/lib/connectors.ts`

## O que a migration faz

1. Reforça o `source_catalog` como catálogo governado de fontes.
2. Semeia fontes P0, P1 e P2 para originação FIDC/DCM.
3. Mantém metadata com `code`, `provider`, `tags`, `signalFocus` e `expectedOutputs`.
4. Usa lógica defensiva para suportar o schema canônico local e o schema observado em produção.

## O que o runtime faz

1. Usa peso de confiança por categoria de fonte.
2. Classifica melhor sinais de FIDC, DCM, crédito, recebíveis, funding, contratos públicos, judicial/fiscal, expansão e contratação.
3. Grava evidência com fonte, URL, timestamp e confiança.
4. Mantém RSS parametrizado por empresa usando templates no `source_catalog`.

## Pipeline afetado

`Sources -> Monitoring Outputs -> Signals -> Enrichment -> Qualification -> Patterns -> Scores -> Ranking -> Pipeline`

## Critério de aceite

1. `source_catalog` expandido e idempotente.
2. Novas fontes públicas monitoráveis disponíveis para captura.
3. Sinais críticos sempre com origem rastreável.
4. Score e tese passam a receber evidências mais qualificadas.
