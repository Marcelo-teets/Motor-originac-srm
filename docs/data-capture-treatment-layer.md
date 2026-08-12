# Data Treatment & Enrichment Engine v2

## Objetivo

Transformar a captura bruta em inteligência de originação **sem criar uma arquitetura paralela** ao motor existente.

A camada atua imediatamente depois dos conectores e antes de qualification, patterns, score, ranking e pipeline. O princípio é simples:

> Todo dado capturado pode ser armazenado para auditoria, mas somente evidência tratada e aprovada pode influenciar uma decisão de originação.

## Fluxo operacional

```txt
Search Profile / Scheduler
        |
        v
Connectors / Monitoring
        |
        v
monitoring_outputs brutos
        |
        v
Dedupe + confidence calibration
        |
        v
Data Treatment v2
  - canonicalização
  - fingerprint estável
  - relevance score
  - quality score
  - fatos normalizados
  - observed x inferred
  - famílias de sinais
  - estruturas sugeridas
  - próxima ação
        |
        v
Persistência bruta + source_documents
        |
        v
Source Document Quality Gate
        |
        v
Per-output Decision Gate
        |
   +----+----------------------------+
   | aprovado                        | review/quarantine/reprovado
   v                                 v
company_signals / enrichments        somente auditoria
   |
   v
Qualification -> Patterns -> Scores -> Ranking -> Pipeline
```

## O que mudou em relação à v1

A `capture_treatment_v1` fazia principalmente classificação por palavras-chave e relevância. A v2 acrescenta uma barreira operacional completa entre captura e decisão.

### 1. Fingerprint de conteúdo

Cada evidência recebe um `contentFingerprint` SHA-256 estável. URLs são canonicalizadas removendo fragmentos e parâmetros de tracking como `utm_*` e `gclid`.

O fingerprint do tratamento **não substitui** o `content_hash` de `source_documents`: o primeiro identifica conteúdo equivalente para tratamento e auditoria; o segundo continua representando o evento capturado e preserva o histórico temporal.

### 2. Quality score

Cada output recebe um score de qualidade de 0 a 100 considerando:

- confiança da fonte;
- conector real ou parcial;
- existência de URL de evidência;
- densidade mínima de conteúdo;
- atualidade da evidência.

Issues possíveis incluem:

- `partial_connector`
- `missing_source_url`
- `thin_content`
- `low_source_confidence`
- `stale_evidence`

### 3. Relevance score

A relevância mede o quanto a evidência importa para originação de crédito estruturado. Ela considera peso da família detectada, confiança da fonte, presença de sinal explícito e combinação de múltiplas famílias.

### 4. Fatos normalizados

A v2 extrai fatos simples e auditáveis do material capturado, incluindo:

- valores em R$;
- percentuais;
- menções a CNPJ;
- famílias de sinais detectadas;
- hints de estrutura.

Esses fatos são registrados como evidência, não como verdade econômica final sem validação adicional.

### 5. Observed x inferred

A camada preserva a distinção institucional do projeto:

- `observed`: evidência explicitamente presente na fonte;
- `inferred`: interpretação derivada da evidência.

Outputs brutos são persistidos como observados. Sinais e enrichments carregam seu nível de evidência individual.

### 6. Gate intrínseco

Para um output gerar sinais próprios da camada v2, ele precisa simultaneamente:

- `relevanceScore >= 55`;
- `qualityScore >= 55`.

Evidência abaixo do corte continua persistida para auditoria, mas não gera signal de tratamento.

### 7. Source Document Quality Gate

Depois da persistência, cada `source_document` passa pela função existente `run_source_document_quality_gate`.

Status que podem seguir para decisão:

- `allow`
- `validated`
- `verified`

Status como `review`, `quarantine`, erro ou documento ausente bloqueiam a evidência.

### 8. Decision Gate por output

A decisão final é feita por `monitoring_output_id`, e não apenas por empresa + fonte.

Isso resolve um problema importante: duas evidências da mesma empresa e da mesma fonte podem ter qualidades diferentes. Uma evidência aprovada não libera automaticamente outra que esteja em review ou quarantine.

Signals/enrichments com referência exata a outputs só seguem quando **todos** os outputs utilizados passaram pelo gate.

## Famílias de sinais

| Família | O que detecta | Próxima validação |
|---|---|---|
| `credit_product` | crédito, lending, BNPL, parcelamento, capital de giro | crédito é core? qual funding suporta a carteira? |
| `receivables` | recebíveis, antecipação, cartão, duplicatas, recorrência | ativo-lastro, elegibilidade e concentração |
| `funding_need` | funding, capital, dívida, liquidez, runway | ticket, prazo, custo atual e funding gap |
| `fidc_fit` | FIDC, securitização, cessão, direitos creditórios | performance, elegibilidade e waterfall |
| `dcm_fit` | nota comercial, debênture, CRA/CRI, emissão | capital structure, garantias, covenants e investidor |
| `growth_timing` | expansão, contratação, novo produto, aquisição | pressão sobre capital de giro/funding |
| `risk_validation` | inadimplência, provisão, chargeback, default | vintage, perdas, concentração e mitigadores |

## Persistência no Supabase

### `monitoring_outputs`

Continua sendo a evidência capturada. O `normalized_payload.treatment` passa a registrar:

```json
{
  "version": "capture_treatment_v2",
  "contentFingerprint": "sha256...",
  "relevanceScore": 88,
  "qualityScore": 84,
  "confidenceScore": 0.87,
  "signalFamilies": ["receivables", "fidc_fit"],
  "suggestedStructures": ["FIDC"],
  "detectedKeywords": ["recebiveis", "fidc"],
  "evidenceLevel": "observed",
  "normalizedFacts": {
    "moneyAmounts": ["R$ 50 milhões"],
    "percentages": [],
    "cnpjMentions": []
  },
  "qualityIssues": [],
  "intrinsicDecisionEligible": true,
  "recommendedNextAction": "Checar ativo-lastro, histórico de performance, elegibilidade e waterfall possível."
}
```

### `data_treatment_runs`

Histórico versionado de cada execução da camada de tratamento. Armazena volume visto, relevante, elegível, scores médios, versão e metadados do run.

### `data_treatment_results`

Trilha por evidência. Registra:

- `monitoring_output_id`;
- fingerprint;
- relevance / quality / confidence;
- observed x inferred;
- famílias e estruturas sugeridas;
- fatos normalizados;
- issues de qualidade;
- lineage;
- gate intrínseco;
- status do source-document gate;
- elegibilidade final;
- motivo de bloqueio.

As duas tabelas possuem RLS e são operadas pelo `service_role`; não são expostas diretamente a `anon` ou `authenticated`.

### `company_signals`

Signals da v2 guardam referência ao output e evidência usada. Exemplos:

- `credit_product_detected`
- `receivables_detected`
- `funding_gap_signal`
- `fidc_fit_signal`
- `dcm_fit_signal`
- `growth_timing_trigger`
- `risk_validation_signal`

### `enrichments`

O enrichment principal passa a ser `capture_treatment_profile_v2`, consolidando apenas evidências intrinsecamente elegíveis e apontando os respectivos `outputId`s.

## Barreira antes da decisão

`CaptureRuntimeService` executa o seguinte contrato:

1. captura dados;
2. trata os outputs;
3. persiste evidência bruta;
4. executa quality gate;
5. recebe o `TreatmentDecisionGate` da persistência;
6. filtra os resultados em memória por output;
7. exige também `isCompanyDecisionEligible(company)`;
8. somente então chama `CaptureDerivedSyncService`.

Portanto, qualification, patterns, score e pipeline deixam de consumir automaticamente tudo que o conector conseguiu capturar.

## Versionamento

Qualification e score gerados por esse fluxo usam `capture_treatment_v2` como versão. Isso permite comparar histórico e reprocessar evidências futuramente sem confundir resultados de regras diferentes.

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `backend/src/modules/data-capture/captureTreatment.ts` | tratamento, scores, normalização e signals v2 |
| `backend/src/modules/data-capture/captureDecisionGate.ts` | barreira por evidência antes das camadas decisórias |
| `backend/src/modules/data-capture/dataCaptureEngine.ts` | integração do tratamento com captura e corroboração |
| `backend/src/modules/data-capture/types.ts` | contratos de tratamento, lineage e gate |
| `backend/src/services/capturePersistenceService.ts` | persistência, quality gate e auditoria |
| `backend/src/services/captureRuntimeService.ts` | orquestra captura -> tratamento -> decisão |
| `backend/src/services/captureDerivedSyncService.ts` | qualification/patterns/scores/pipeline somente com evidência aprovada |
| `db/migrations/20260812053000_data_treatment_enrichment_v2.sql` | audit tables, índices e RLS |

## Testes

O contrato de CI cobre:

1. separação entre monitoring e decisão;
2. obrigatoriedade do Company Master decision gate;
3. obrigatoriedade do per-output evidence gate;
4. evidência forte gerando tratamento/signal;
5. evidência fraca retida, mas bloqueada;
6. canonicalização/fingerprint estável;
7. signal/enrichment com output bloqueado não chegando às camadas derivadas.

## Operação após merge

O workflow de captura existente continua sendo o acionador. Não foi criada nova rotina paralela.

Para validar um run real:

1. executar o capture runtime para uma empresa monitorável;
2. conferir o `monitoring_output` bruto;
3. conferir `source_documents.quality_status`;
4. conferir `data_treatment_runs` e `data_treatment_results`;
5. validar `decision_eligible` e eventual `decision_block_reason`;
6. confirmar que somente outputs elegíveis criaram/alteraram qualification, patterns, score e pipeline.

## Resultado esperado para originação

A camada existe para melhorar cinco respostas práticas:

- qual evidência merece confiança;
- qual sinal financeiro ela contém;
- se indica recebíveis, produto de crédito, funding gap ou timing;
- qual estrutura preliminar merece validação;
- se o dado está bom o suficiente para alterar prioridade comercial.

Se a evidência não for forte o suficiente, o comportamento correto é **guardar, explicar o bloqueio e continuar monitorando** — não promover ruído para o ranking.
