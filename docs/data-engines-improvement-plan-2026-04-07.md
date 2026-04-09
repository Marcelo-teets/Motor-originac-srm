# Plano de Melhoramento — Motor de Captura e Motor de Tratamento/Esquecimento

Data: 2026-04-07
Escopo: `backend/src/modules/data-capture` e `backend/src/modules/data-enrichment`

## 1) Objetivos de produto e engenharia

### Objetivos principais
1. Aumentar a **precisão** de captura (menos ruído e duplicidade).
2. Melhorar a **atualidade** dos dados usados para enriquecimento.
3. Tornar o motor de tratamento/esquecimento **auditável** e previsível.
4. Reduzir custo operacional (menos reprocessamento improdutivo).

### Resultados esperados (KPIs)
- Taxa de duplicação de outputs `< 3%` por execução.
- Cobertura de fontes críticas com sucesso real `> 90%`.
- Redução de requests reabertos para evidências fracas em `30%`.
- Percentual de outputs antigos sem uso ativo `< 10%`.

---

## 2) Diagnóstico atual (hipóteses de risco)

### Captura
- Critérios de dedupe ainda podem gerar falsos positivos/falsos negativos.
- Score de confiança é linear e não versionado.
- Falta trilha completa para explicar por que um output foi aceito/rebaixado.

### Tratamento / Esquecimento
- Janela temporal fixa pode não refletir comportamento por fonte/segmento.
- Política de esquecimento não está separada por “valor do sinal” vs “idade”.
- Faltam categorias explícitas de decisão (manter, revalidar, esquecer, arquivar).

---

## 3) Arquitetura-alvo (incremental)

## 3.1 Motor de Captura (DataCaptureEngine)

### A. Pipeline de captura em estágios
1. **Ingestão bruta** por conector.
2. **Normalização semântica** por tipo de fonte.
3. **Deduplicação multicritério** (hash semântico + URL canônica + título/data).
4. **Scoring versionado** (`confidence_v2`).
5. **Classificação de qualidade**: `high`, `medium`, `low`, `discard`.

### B. Melhorias técnicas propostas
- Introduzir `confidenceModelVersion` em output/documento.
- Guardar `reasons[]` no scoring (ex.: `source_trusted`, `missing_url`, `stale_content`).
- Adicionar canonicalização de URL robusta (remoção de tracking params, trailing slash e host normalization).
- Implementar fallback de dedupe por similaridade textual (ex.: Jaccard simples).
- Suportar limite por orçamento de execução (`maxSources`, `maxItemsPerSource`).

### C. Observabilidade de captura
- Métricas por execução:
  - `ingested_count`
  - `normalized_count`
  - `deduped_count`
  - `discarded_count`
  - `confidence_distribution`
- Eventos de erro por conector com código padronizado.

## 3.2 Motor de Tratamento/Esquecimento (DataTreatmentEngine)

### A. Estados de ciclo de vida do output
- `active`: sinal recente e/ou confiável.
- `review`: sinal envelhecendo ou confiança média.
- `stale`: sem atualizações no SLA esperado.
- `forgotten`: baixo valor + antigo + sem revalidação.
- `archived`: mantido só para auditoria/histórico.

### B. Política de esquecimento parametrizada
- Regras por tipo de fonte e criticidade:
  - fontes institucionais: janela maior
  - fontes voláteis (news/social): janela menor
- Fórmula de prioridade para revalidação:
  - `priority = recency_weight + confidence_gap + business_impact`
- “Quarentena” antes de esquecer definitivamente (ex.: 7 dias) com chance de recuperação.

### C. Tratamento inteligente
- Gerar requests de captura apenas para `active/review` com alto impacto esperado.
- Ignorar outputs com baixa utilidade histórica após limiar de esquecimento.
- Produzir score de qualidade por empresa com decomposição:
  - `freshness_score`
  - `reliability_score`
  - `coverage_score`

---

## 4) Roadmap de implementação (4 fases)

## Fase 1 — Endurecimento (1 sprint)
- Externalizar thresholds em config/env.
- Criar enums/constantes de estados do ciclo de vida.
- Log estruturado com `decision_reasons`.
- Métricas mínimas de dedupe e freshness.

**Entregáveis**
- Config centralizada de janelas/limiares.
- Campos de auditoria em outputs.

## Fase 2 — Qualidade de decisão (1–2 sprints)
- Implementar `confidenceModelVersion`.
- Regras de dedupe semântico v2.
- Classificação `active/review/stale/forgotten/archived` no tratamento.

**Entregáveis**
- Motor de scoring v2 + relatório de comparação v1 vs v2.

## Fase 3 — Eficiência operacional (1 sprint)
- Scheduler com orçamento adaptativo por fonte.
- Priorização de revalidação por impacto de negócio.
- Backpressure para evitar tempestade de requests.

**Entregáveis**
- Queda mensurável de requests improdutivos.

## Fase 4 — Governança e auditoria (1 sprint)
- Painel de observabilidade dos motores.
- Trilha de decisão auditável por output.
- Runbook de incidentes e rollback de modelo de confiança.

**Entregáveis**
- Dashboard + documentação operacional final.

---

## 5) Plano de testes e validação

### Testes unitários
- Deduplicação (casos de colisão e não-colisão).
- Canonicalização de URL.
- Cálculo de confiança com reasons.
- Regras de transição de estado no esquecimento.

### Testes de integração
- Execução completa `capture -> treatment` com múltiplas fontes.
- Cenários com dados antigos, duplicados e inconsistentes.

### Testes de regressão operacional
- Comparar métricas antes/depois por 7 dias de execução.
- Alertar se `discarded_count` ou `forgotten_count` sair do envelope esperado.

---

## 6) Backlog técnico priorizado

### P0
1. Parametrizar thresholds e janelas por ambiente.
2. Versionar modelo de confiança e incluir reasons.
3. Introduzir estados formais de ciclo de vida no tratamento.

### P1
4. Dedupe semântico v2 com similaridade textual.
5. Priorização de recaptura por impacto.
6. Métricas e eventos padronizados por etapa.

### P2
7. Dashboard operacional.
8. Autoajuste de janelas por comportamento de fonte.
9. Rotina de auditoria e explainability por output.

---

## 7) Riscos e mitigação

- **Risco:** excesso de descarte por regras agressivas.
  - **Mitigação:** rollout progressivo + shadow mode.

- **Risco:** regressão em cobertura de fontes.
  - **Mitigação:** SLO por conector e fallback configurável.

- **Risco:** aumento de complexidade de manutenção.
  - **Mitigação:** modularização por etapa + contratos tipados + testes unitários focados.

---

## 8) Próximas ações imediatas

1. Aprovar este plano (arquitetura e KPIs).
2. Abrir issues por fase com critérios de aceite.
3. Implementar Fase 1 em branch dedicada.
4. Rodar baseline de métricas por 7 dias para comparação.
