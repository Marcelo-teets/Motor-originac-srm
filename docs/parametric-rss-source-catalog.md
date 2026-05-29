# Parametric RSS Source Catalog

## Objetivo

Permitir que o `source_catalog` alimente o runtime de captura com fontes RSS parametrizadas por empresa, sem criar stack paralela.

## Contrato de metadata

Cada fonte RSS pode incluir:

```json
{
  "code": "src_fidc_market_rss",
  "provider": "google-news-rss",
  "queryTemplate": "{company} FIDC OR recebíveis OR securitização",
  "tags": ["fidc", "receivables", "dcm"],
  "signalFocus": "first_fidc_or_structured_receivables"
}
```

Placeholders aceitos:

- `{company}`
- `{tradeName}`
- `{legalName}`
- `{segment}`
- `{subsegment}`
- `{cnpj}`

## Fontes recomendadas

| ID | Foco | Query template |
| --- | --- | --- |
| `src_fidc_market_rss` | primeiro FIDC / recebíveis estruturados | `{company} FIDC OR recebíveis OR securitização` |
| `src_debt_capital_markets_rss` | funding, dívida e timing DCM | `{company} captação OR dívida OR debênture OR nota comercial OR funding` |
| `src_vc_pe_portfolio_rss` | crescimento e backing VC/PE | `{company} startup OR venture capital OR rodada OR Series A OR Series B` |
| `src_credit_product_launch_rss` | produto de crédito / embedded finance | `{company} lançou crédito OR antecipação OR BNPL OR embedded finance` |

## Impacto no pipeline

Essas fontes reforçam o fluxo:

`Sources -> Monitoring Outputs -> Signals -> Enrichment -> Qualification -> Patterns -> Score -> Ranking -> Pipeline`

O objetivo é aumentar sinais públicos reais de:

- funding gap;
- primeiro FIDC;
- produto de crédito virando core;
- crescimento sem estrutura de capital;
- timing para DCM/FIDC.
