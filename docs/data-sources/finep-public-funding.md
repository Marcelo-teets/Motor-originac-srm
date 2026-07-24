# Finep · Operações e Desembolsos

## Objetivo

Incorporar dados públicos oficiais da Finep ao motor de originação para identificar empresas em ciclos reais de inovação, investimento, execução de projetos e uso de funding institucional.

A integração não interpreta apoio Finep como funding gap. O dado serve para responder:

- a empresa possui funding público contratado?
- qual é a natureza financeira do apoio?
- o projeto está contratado ou em execução?
- houve liberações recentes?
- existem contrapartidas, capex adicional ou próximos marcos que justifiquem abordagem?
- há espaço para capital complementar, alongamento ou estrutura de mercado de capitais?

## Fontes oficiais

| Recurso | URL operacional | Atualização |
|---|---|---|
| Operações contratadas | `https://download.finep.gov.br/Contratacao.xlsx` | semanal |
| Desembolsos | `https://download.finep.gov.br/Liberacao.xlsx` | semanal |
| Catálogo | Central de Downloads Finep | institucional |

O conector tenta descobrir os links no catálogo e mantém os dois downloads oficiais como fallback bounded.

## Naturezas financeiras

A integração preserva três naturezas distintas:

1. `reimbursable_credit`
   - crédito direto;
   - crédito descentralizado;
   - condições financeiras do contrato.

2. `non_reimbursable_grant`
   - subvenção direta;
   - subvenção descentralizada;
   - apoio não reembolsável a ICTs;
   - projetos ANCINE quando aplicável.

3. `equity_investment`
   - investimento direto da Finep em startups.

Desembolso é tratado como evidência de execução do instrumento original, não como uma quarta natureza de funding.

## Pipeline

```text
Finep XLSX oficial
→ discovery + ETag/Last-Modified
→ parser XLSX bounded
→ match por CNPJ no Company Master governado
→ bronze_historical_records
→ public_company_records
→ monitoring_outputs
→ company_signals
→ company_factor_observations
→ company_factor_snapshots
→ patterns / qualification / score / ranking somente quando decision_eligible=true
```

## Elegibilidade

Uma empresa só entra na busca quando:

- `data_status=real`;
- `identity_verified=true`;
- `monitoring_eligible=true`;
- `synthetic_seed!=true`;
- `excluded_from_monitoring!=true`;
- CNPJ é válido.

Empresas apenas monitoráveis podem receber registros, outputs, sinais e fatores. Qualification, score, lead score, ranking e pipeline só são recomputados para empresas `decision_eligible=true`.

## Record types

| Record type | Interpretação |
|---|---|
| `finep_credit_operation` | crédito reembolsável contratado |
| `finep_credit_terms` | condições financeiras e prazo, sem sinal autônomo |
| `finep_grant_operation` | apoio não reembolsável |
| `finep_direct_investment` | investimento direto em startup |
| `finep_disbursement` | liberação de recursos / execução |

## Signals

| Record type | Signal | Strength | Confidence |
|---|---|---:|---:|
| crédito contratado | `public_financing_signal` | 82 | 0,96 |
| subvenção | `innovation_investment_signal` | 72 | 0,96 |
| investimento direto | `innovation_investment_signal` | 78 | 0,96 |
| desembolso | `innovation_disbursement_signal` | 80 | 0,96 |

`finep_credit_terms` enriquece a evidência do contrato, mas não cria signal isolado.

## Factors

Além do fator existente `existing_public_funding`, a integração acrescenta:

- `innovation_capex_cycle`
  - dimensão: timing;
  - indica projeto institucional de inovação, contrapartida e possíveis necessidades complementares.

- `public_funding_execution`
  - dimensão: executability;
  - indica execução financeira comprovada por liberações oficiais.

Nenhuma regra Finep contribui diretamente para `funding_gap_pressure`.

## Patterns

- `innovation_capex_funding_window`
  - confirmar orçamento total, contrapartidas, capex adicional, cronograma e estrutura complementar.

- `public_funding_execution_window`
  - acompanhar liberações, execução física/financeira e próximos marcos.

## Controles operacionais

- download máximo: 128 MB por workbook;
- entry XLSX máximo: 512 MB descompactado;
- total XLSX máximo: 2 GB descompactados;
- timeout do workflow: 120 minutos;
- checkpoint por workbook com ETag/Last-Modified;
- record key determinística por contrato/projeto/liberação;
- upsert idempotente;
- payload bruto exclui coordenador, CPF, telefone, e-mail, contato e responsável;
- nenhuma função Vercel adicional;
- execução semanal via GitHub Actions, terça-feira às 10h10 BRT.

## Operação e observabilidade

Dataset: `finep_financing_operations`

Source: `src_finep_financing_operations`

O dataset aparece em `get_public_data_operations_snapshot()` com:

- estado da fonte;
- último run;
- checkpoints;
- linhas lidas;
- registros aderentes;
- empresas encontradas;
- outputs e sinais persistidos;
- próxima ação.

## Critérios de sucesso

1. Os dois XLSX oficiais são descobertos e lidos.
2. O parser reconhece as abas financeiras suportadas.
3. Apenas CNPJs governados do Company Master são persistidos.
4. Crédito, subvenção e investimento direto permanecem separados.
5. Desembolso gera evidência de execução.
6. Nenhum dado Finep cria funding gap automaticamente.
7. Empresas não elegíveis para decisão permanecem fora de score e pipeline.
8. O painel operacional responde abaixo do statement timeout.
