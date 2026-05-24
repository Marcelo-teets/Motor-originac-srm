# Data Capture Treatment Layer

## Objetivo

Transformar captura bruta em inteligência operacional para originação.

A captura deixa de ser apenas registro de `monitoring_outputs` e passa a produzir uma camada tratada com:

- famílias de sinais relevantes para crédito estruturado;
- indicação preliminar de estrutura aderente;
- score de relevância do output capturado;
- próxima ação comercial sugerida;
- enriquecimento consolidado da empresa.

## Fluxo implementado

```txt
connectors
-> monitoring_outputs brutos
-> dedupe + confidence calibration
-> capture treatment
-> treated monitoring_outputs
-> treatment company_signals
-> treatment enrichments
-> persistence Supabase
```

## Famílias de sinais

| Família | O que detecta | Saída esperada |
|---|---|---|
| `credit_product` | produto de crédito, lending, BNPL, parcelamento, capital de giro | validar se crédito é core e funding atual |
| `receivables` | recebíveis, antecipação, cartão, duplicatas, mensalidades, contratos recorrentes | mapear ativo-lastro e fit para FIDC |
| `funding_need` | funding, capital, dívida, liquidez, caixa, runway | validar ticket, prazo e custo de capital |
| `fidc_fit` | FIDC, securitização, cessão, direitos creditórios, carteira de crédito | checar elegibilidade, performance e waterfall |
| `dcm_fit` | nota comercial, debênture, CRA/CRI, emissão, mercado de capitais | validar estrutura de capital e apetite investidor |
| `growth_timing` | expansão, crescimento, contratação, novo produto, parceria, aquisição | entender pressão de capital de giro |
| `risk_validation` | inadimplência, provisão, chargeback, default, atraso, reestruturação | validar qualidade da carteira e mitigadores |

## Arquivos alterados

| Arquivo | Papel |
|---|---|
| `backend/src/modules/data-capture/captureTreatment.ts` | nova camada de tratamento dos outputs |
| `backend/src/modules/data-capture/dataCaptureEngine.ts` | aplica tratamento após calibragem e antes da persistência |
| `backend/src/modules/data-capture/types.ts` | adiciona diagnóstico de tratamento ao run |
| `backend/src/services/capturePersistenceService.ts` | passa a persistir `enrichments` gerados pelo capture runtime |
| `db/migrations/019_capture_treatment_runtime_alignment.sql` | garante tabela/índices necessários para produção |

## Saídas no Supabase

### `monitoring_outputs.payload.treatment`

Cada output capturado recebe um bloco de tratamento:

```json
{
  "version": "capture_treatment_v1",
  "relevanceScore": 88,
  "signalFamilies": ["receivables", "fidc_fit"],
  "suggestedStructures": ["FIDC"],
  "detectedKeywords": ["recebiveis", "fidc"],
  "evidenceLevel": "observed",
  "recommendedNextAction": "Checar ativo-lastro, histórico de performance, elegibilidade e waterfall possível."
}
```

### `company_signals`

São criados sinais adicionais quando o output tem relevância suficiente. Exemplos:

- `credit_product_detected`
- `receivables_detected`
- `funding_gap_signal`
- `fidc_fit_signal`
- `dcm_fit_signal`
- `growth_timing_trigger`
- `risk_validation_signal`

### `enrichments`

É criado um enrichment `capture_treatment_profile` por empresa quando há output relevante. Ele consolida:

- outputs de maior relevância;
- famílias dominantes;
- estruturas sugeridas;
- próximas ações recomendadas.

## Critério de produção

A camada foi desenhada para ser determinística, explicável e auditável.

Ela não substitui score, qualification ou thesis generator. Ela alimenta essas camadas com dados tratados e rastreáveis.

## Próximo passo recomendado

Após merge e aplicação da migration, executar o workflow `capture.yml` manualmente e conferir:

1. `source_connector_runs` com `metadata.treatment` preenchido;
2. `monitoring_outputs` com `payload.treatment`;
3. `company_signals` com sinais novos;
4. `enrichments` com `capture_treatment_profile`;
5. dashboard/ranking refletindo sinais capturados nas próximas iterações.
