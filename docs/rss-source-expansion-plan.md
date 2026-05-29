# RSS Source Expansion Plan — Origination Intelligence Platform

## Objetivo

Aumentar a capacidade de captura pública real sem adicionar stack nova.

Esta expansão usa o `source_catalog` existente e o runtime atual de captura RSS/Google News para reforçar sinais de DCM/FIDC.

## Fontes priorizadas

| Fonte | Objetivo de originação | Sinais esperados |
| --- | --- | --- |
| FIDC Market Signals | Detectar empresas próximas de primeiro FIDC ou securitização | FIDC, recebíveis, securitização, direitos creditórios |
| Debt Capital Markets | Capturar timing de funding e dívida | captação, dívida, debênture, nota comercial, crédito privado |
| VC/PE Portfolio Movement | Capturar crescimento com backing institucional | rodada, venture capital, private equity, Series A/B |
| Credit Product Launch | Detectar crédito virando core | antecipação, BNPL, embedded finance, capital de giro |

## Contrato recomendado de metadata

```json
{
  "code": "src_fidc_market_rss",
  "provider": "google-news-rss",
  "queryTemplate": "{company} FIDC recebíveis securitização",
  "tags": ["fidc", "receivables", "dcm"],
  "signalFocus": "first_fidc_or_structured_receivables"
}
```

## Placeholders

- `{company}`
- `{tradeName}`
- `{legalName}`
- `{segment}`
- `{subsegment}`
- `{cnpj}`

## Próxima implementação de código

1. Ensinar `backend/src/lib/connectors.ts` a ler `metadata.queryTemplate`.
2. Renderizar query por empresa.
3. Gerar URL Google News RSS.
4. Deduplicar por `source.id + url`.
5. Persistir outputs em `monitoring_outputs` e sinais em `company_signals`.

## Por que isso importa

Essa frente reduz mock e aproxima o MVP do pipeline oficial:

`Sources -> Monitoring Outputs -> Signals -> Enrichment -> Qualification -> Patterns -> Score -> Ranking -> Pipeline`

O ganho esperado é aumentar a quantidade e qualidade de sinais públicos de funding gap, recebíveis estruturáveis e timing para FIDC/DCM.
