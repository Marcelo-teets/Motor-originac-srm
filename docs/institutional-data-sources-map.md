# Institutional Data Sources Map — Motor Originação SRM

## Objetivo

Transformar o mapa de fontes do Motor - Originação em um catálogo governado, monitorável e acionável dentro do fluxo oficial:

`Search Profile -> Sources -> Monitoring -> Raw Outputs -> Signals -> Enrichment -> Qualification -> Patterns -> Score -> Thesis -> Ranking -> Pipeline`

O foco é aumentar a capacidade de originar operações reais de FIDC/DCM com dados públicos, rastreáveis e Brasil-only.

## Regra de governança

Cada fonte precisa responder:

1. Qual evidência ela traz?
2. Qual sinal ela pode gerar?
3. Qual módulo ela alimenta?
4. Qual é sua confiança?
5. Qual é a frequência de atualização?
6. O dado é observado, inferido ou estimado?
7. Como isso vira próxima ação comercial?

## Fontes implementadas nesta frente

| Fonte | Categoria | Status | Prioridade | Sinais principais | Uso operacional |
| --- | --- | --- | ---: | --- | --- |
| Receita Federal CNPJ Dataset | company_registry | real | 100 | company_identity, entity_resolution, cnae_sector, legal_status | Company Master e deduplicação |
| CVM Dados Abertos Fundos e Ofertas | capital_markets | real | 100 | existing_fidc, structured_fund_presence, capital_markets_activity | FIDC/DCM evidence e comparáveis |
| Banco Central IFData e Instituições Autorizadas | central_bank | real | 95 | regulatory_license, regulated_financial_activity | fintech regulada, IP/SCD/SEP, risco reputacional |
| ANBIMA Fundos Estruturados | funds_structured | real | 95 | existing_fidc, fidc_comparable, fund_service_provider | comparáveis e prestadores FIDC |
| B3 Emissores e Fatos Relevantes | capital_markets | real | 85 | public_debt_signal, corporate_event, dcm_comparable | contexto DCM e companhias comparáveis |
| Open Finance Brasil Participantes | open_finance | real | 80 | financial_product_surface, open_finance_participant | superfície pública de produtos financeiros |
| VC Portfolio Monitor Brasil | vc_portfolio | real | 90 | vc_backed_growth_signal, cap_table_quality | descoberta early de empresas tech-backed |
| Company Careers and Jobs Monitor | jobs | real | 80 | credit_team_expansion, finance_org_building | sinal fraco de funding/timing |
| Procurement and Public Contracts Monitor | government_contracts | planned | 70 | government_receivables, recurring_contracts | Fase 2 para B2G/recebíveis públicos |
| Origination Google Dorks Monitor | search_dork | planned | 75 | documented_credit_structure, hidden_company_document | descoberta de PDFs, decks e documentos públicos |

## Sinais operacionais padronizados

O runtime passa a classificar evidências em sinais mais acionáveis:

- `existing_fidc`
- `existing_debt`
- `funding_event`
- `has_credit_product`
- `has_receivables`
- `embedded_finance_pressure`
- `regulatory_license`
- `growth_signal`
- `approach_trigger`
- `vc_backed_growth_signal`
- `risk_alert`
- `capital_mismatch`
- `market_signal`

## Como isso melhora o score

### Structural Need

Aumenta quando há evidência de:

- produto de crédito;
- recebíveis;
- embedded finance;
- carteira/parcelamento/repasse;
- dependência de funding escalável.

### Timing

Aumenta quando há evidência de:

- rodada/captação;
- vagas de crédito/tesouraria/risk;
- expansão;
- mudança no site;
- notícia recente;
- novo produto financeiro.

### Executability

Aumenta quando há evidência de:

- FIDC existente/comparável;
- debênture/nota comercial/CCB/CRI/CRA;
- prestadores identificáveis;
- fonte regulatória ou oficial;
- governança/maturidade operacional.

## Critério de aceite

A implementação é considerada válida quando:

1. A migration `022_source_catalog_institutional_expansion.sql` roda sem duplicar fontes.
2. O `source_catalog` passa a conter fontes institucionais com `metadata.code`, prioridade, frequência, sinais e governança.
3. O runtime de captura consegue inferir códigos para novas fontes.
4. `company_signals.signal_type` passa a receber sinais mais específicos que `market_signal` quando houver evidência no texto.
5. A próxima execução recorrente de captura gera outputs/sinais úteis para qualificação, tese e ranking.

## Próxima PR recomendada

`feat(capture): add source-specific ingestion adapters`

Escopo:

- adapter Receita Federal batch;
- adapter CVM open-data/FIDC;
- adapter ANBIMA structured funds;
- adapter BCB institutions;
- tela/endpoint para ver saúde por fonte e últimos sinais gerados.
