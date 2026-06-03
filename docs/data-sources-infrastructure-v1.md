# Data Sources Infrastructure v1 — Motor Originação SRM

## Objetivo

Transformar o mapa de fontes do Motor em infraestrutura operacional dentro do stack oficial:

- React + Vite no frontend.
- Node + TypeScript no backend.
- Supabase/Postgres como banco e autenticação.
- Vercel como deploy.
- GitHub como fonte oficial do código.

Esta frente não cria stack paralela. Ela expande `source_catalog`, melhora a governança das fontes e reforça o runtime de captura para gerar sinais explicáveis.

## Pipeline operacional

```txt
source_catalog
→ connector/runtime
→ monitoring_outputs
→ company_signals
→ enrichments
→ qualification_snapshots
→ company_patterns
→ score_snapshots / lead_score_snapshots
→ ranking
→ pipeline / activities / tasks
```

## Categorias oficiais

| Categoria | Uso no Motor | Prioridade |
| --- | --- | ---: |
| `company_registry` | identidade, CNPJ, CNAE, entity resolution | P0 |
| `fidc` | FIDC existente, comparáveis, recebíveis estruturados | P0 |
| `central_bank` | fintechs reguladas e instituições financeiras | P0 |
| `capital_markets` | debêntures, CRI, CRA, mercado de dívida | P0/P1 |
| `company_site` | fonte primária de produto, pricing, FAQ, docs | P0 |
| `news_niche` | timing, funding, lançamento de produto | P0 |
| `vc_portfolio` | backing institucional e discovery de startups | P0/P1 |
| `procurement` | contratos públicos e recebíveis governamentais | P1 |
| `judicial` | risco jurídico e stress financeiro | P1 |
| `intellectual_property` | marcas, software, ativos tecnológicos | P2 |
| `jobs` | contratação de crédito, risco, cobrança, tesouraria e CFO | P1 |
| `contact_enrichment` | contatos para outbound, não para score de qualidade | P2 |

## Fontes semeadas nesta infraestrutura

### P0 — base institucional

- BrasilAPI CNPJ.
- Receita Federal CNPJ Dados Abertos.
- CVM FIDC Informes Mensais.
- CVM News RSS.
- Banco Central IFData.
- ANBIMA Data.
- Company Websites.
- Google News Company RSS.
- FIDC Market Signals RSS.
- DCM Funding Signals RSS.
- VC Portfolio Movement RSS.
- Credit Product Launch RSS.

### P1 — profundidade e risco

- PNCP Contratos e Compras Públicas.
- DataJud CNJ API Pública.
- Hiring and Finance Jobs RSS.

### P2 — apoio comercial e maturidade

- INPI Dados Abertos.
- Paid Contact Enrichment Vendors.

## Contrato de metadata

Cada fonte deve expor metadata suficiente para o runtime e para auditoria.

```json
{
  "code": "src_fidc_market_rss",
  "provider": "google-news-rss",
  "queryTemplate": "{company} FIDC recebiveis securitizacao direitos creditórios",
  "tags": ["fidc", "receivables", "securitization"],
  "signalFocus": "first_fidc_or_structured_receivables",
  "expectedOutputs": ["has_fidc", "fidc_comparable", "market_map"]
}
```

## Placeholders permitidos em RSS parametrizado

- `{company}`
- `{tradeName}`
- `{legalName}`
- `{segment}`
- `{subsegment}`
- `{cnpj}`

## Governança de confiança

O runtime agora usa uma régua de confiança por categoria de fonte.

| Fonte | Peso aproximado |
| --- | ---: |
| Regulatório/oficial/CVM/BCB/Receita/ANBIMA/judicial | 0.92 |
| Site da própria empresa | 0.86 |
| Portfólio VC/growth | 0.82 |
| Notícias tradicionais | 0.78 |
| Notícias nichadas/RSS | 0.70 |
| Jobs/social/tech/reputação | 0.58 |
| Vendor pago de contato | 0.45 |
| Search dork/inferido | 0.42 |

Regra: fonte paga de contato ajuda execução comercial, mas não deve elevar score de crédito sozinha.

## Sinais novos ou reforçados

O runtime passa a classificar melhor os textos capturados em:

- `fidc_or_securitization_signal`
- `dcm_signal`
- `credit_product_signal`
- `receivables_strong`
- `funding_event`
- `public_contract_receivables`
- `judicial_or_fiscal_stress`
- `growth_without_funding`
- `embedded_finance`
- `expansion_signal`
- `market_signal`

## Critério de aceite

1. `source_catalog` com fontes P0/P1/P2 semeadas de forma idempotente.
2. RSS parametrizado gerando buscas por empresa sem hardcode adicional.
3. `monitoring_outputs.normalized_payload` com `sourceCode`, `sourceName`, `sourceCategory`, `sourceType`, `signalFocus` e `sourceConfidenceWeight`.
4. `company_signals.evidence_payload` com URL, timestamp, fonte e confiança.
5. Nenhum sinal crítico sem origem.
6. O Motor continua Brasil-only e focado em originação FIDC/DCM.

## Próximas PRs recomendadas

### PR 1 — loaders oficiais

Branch sugerida:

```txt
gpt/official-loaders-cvm-bcb-pncp
```

Escopo:

- loader CVM FIDC informes mensais;
- loader BCB IFData;
- loader PNCP por nome/CNPJ;
- persistência em `monitoring_outputs` e sinais derivados.

### PR 2 — tela de governança de fontes

Branch sugerida:

```txt
gpt/source-governance-ui
```

Escopo:

- cobertura por categoria;
- última execução por fonte;
- saúde;
- outputs gerados;
- sinais gerados;
- fontes planejadas versus reais.

### PR 3 — comparables engine

Branch sugerida:

```txt
gpt/fidc-dcm-comparables-engine
```

Escopo:

- mapear empresas/setores com FIDC/DCM comparáveis;
- gerar market map preliminar;
- conectar tese com estrutura sugerida.
