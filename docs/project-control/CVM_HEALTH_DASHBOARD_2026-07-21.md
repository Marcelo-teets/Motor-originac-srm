# Capital Market Ingestion Health Dashboard

## Objetivo

Expor no cockpit executivo a saúde operacional dos datasets oficiais da CVM usados pelo Motor Originação.

## Fluxo

`capital_market_dataset_runs` → `capital_market_ingestion_health` → `/api/capital-markets/health` → `CapitalMarketHealthPanel` → Dashboard.

## Datasets cobertos

- Ofertas públicas
- Cadastro de fundos
- FIDC mensal
- CRI mensal
- CRA mensal
- FII mensal

## Indicadores

- status operacional;
- último sucesso;
- duração da última execução;
- registros lidos, inseridos, alterados e inalterados;
- eventos e sinais produzidos;
- taxa de sucesso nos últimos 30 dias;
- erro mais recente;
- próxima ação operacional sugerida.

## Segurança

O endpoint exige bearer token válido do Supabase Auth e consulta a view usando o cliente oficial do projeto.

## Resultado esperado

Dar visibilidade executiva sobre a confiabilidade dos dados regulatórios antes que eles impactem qualification, patterns, ranking e pipeline.
