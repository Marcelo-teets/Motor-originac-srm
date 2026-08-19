# Universal Origination Reasoning v2

## Objetivo

Generalizar o raciocínio do Origination Intelligence Brief para todo dado que possa melhorar uma decisão real de originação.

A cadeia canônica é:

`fato / evidência -> implicação financeira -> pattern -> estrutura possível -> timing / risco -> evidência faltante -> próxima ação`

A camada é deliberadamente **score-neutral**. Source Treatment, Factor Map, Qualification, Patterns, Lead Score e Ranking continuam sendo os mecanismos oficiais de pontuação. O Reasoning v2 explica e operacionaliza; não soma pontos novamente.

## Fontes de raciocínio

O motor consolida três camadas existentes:

1. **Company Signals** — fatos observados e sinais derivados vindos de monitoramento, notícias, sites, jobs, dados públicos, DCM/FIDC, VC etc.
2. **Factor Map** — hipóteses persistidas em `origination_factor_catalog` e `company_factor_observations`, com contribuição, confiança e decay.
3. **Qualification** — funding need, recebíveis, estrutura de capital, executabilidade, timing, risco e qualidade operacional.

## Dimensões de decisão

- `structural_need`: por que essa empresa pode estruturalmente precisar de capital.
- `timing`: por que a janela pode estar melhor agora.
- `executability`: se a operação parece executável e qual estrutura pode fazer sentido.
- `risk`: condicionantes que podem reduzir ou bloquear executabilidade.
- `context`: contexto útil para pricing/comparáveis, sem criar funding need.

## Guardrails obrigatórios

- DCM/FIDC fit é fit, não necessidade.
- FIDC ou dívida existente comprova acesso/readiness, não funding gap.
- Maturidade de dívida cria timing; não significa distress automaticamente.
- Rodada de equity pode reduzir a necessidade imediata de dívida.
- Hiring mede intenção/readiness, não contratações realizadas nem funding gap.
- Headcount/crescimento melhoram timing somente quando ligados a consumo de capital/ativos.
- Macro e mercado são contexto e nunca criam structural need sozinhos.
- Risco pode aumentar urgência, mas deve reduzir executabilidade quando material.
- Signals não mapeados permanecem armazenados, porém não podem alterar tese, estrutura ou prioridade.

## Objetos de banco

### `origination_signal_reasoning_v2(signal_type)`
Mapeador determinístico e governado de semântica por família de sinal.

Retorna:
- domain
- decisionDimension
- semantics
- financialImplication
- patternHint
- structureHint
- validationQuestion
- nextAction
- guardrail
- priorityWeight

### `origination_reasoning_coverage_v2`
Audita todos os tipos de sinais vivos. A migration falha se houver sinal vivo sem semântica mapeada.

### `company_origination_reasoning_evidence_v2`
Camada normalizada de evidências provenientes de Signals, Factor Map e Qualification.

### `company_origination_reasoning_v2`
Consolida evidências por dimensão de decisão, mantendo fatos, semântica, confiança, implicações, perguntas de diligência e guardrails.

### `company_origination_brief_v2`
Extende o brief v1 com:
- `why_credit_v2`
- `why_now_v2`
- `probable_pattern_v2`
- `suggested_structure_v2`
- `commercial_angle_v2`
- `risks_to_validate`
- `missing_evidence`
- `next_action_v2`
- reasoning dimensions e coverage

O `origination_conviction_score` original permanece inalterado para impedir dupla contagem.

## Automação

O canonical signal `origination_brief` continua sendo o artefato lido pelo Thesis Generator e pela UI existente de Company Detail.

O refresh ocorre quando há mudança material em sinais não-contextuais, Qualification, Patterns, Jobs, métricas, investidores ou Company Master. Contexto puro fica disponível no reasoning, mas não dispara refresh caro a cada linha.

Ações humanas no Pipeline nunca são sobrescritas. Apenas placeholders de máquina podem receber a próxima ação recomendada.

## Critério de produção

1. Cobertura de sinais vivos = 100%.
2. `unmapped_signal_types = []`.
3. Brief v2 somente para Company Master real/non-synthetic.
4. `observed`, `inferred`, `estimated`, `contextual` e `recommended` preservados.
5. Lead Score não é recalculado pela camada de reasoning.
6. Pipeline humano preservado.
7. Smoke data removido após validação.
