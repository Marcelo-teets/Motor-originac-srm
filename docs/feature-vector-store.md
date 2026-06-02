# Feature Store + Vector Store — Frente D / D6

## Objetivo

Criar uma camada institucional para transformar sinais e documentos aprovados em:

1. Features auditáveis para score, ranking, qualification e thesis.
2. Contexto vetorial para Copilot/RAG com lineage até documento, fonte e evidência.

Tudo permanece dentro do Supabase/Postgres, sem stack paralela.

## Tabelas criadas

### feature_definitions

Catálogo versionável das features usadas pela plataforma.

Features iniciais:

- has_credit_product
- has_structurable_receivables
- funding_gap_score
- fidc_fit_score
- dcm_fit_score
- latest_relevant_trigger_at
- vc_backed_signal

### company_feature_snapshots

Histórico temporal de features por empresa.

Uso esperado:

- guardar cada cálculo relevante;
- preservar evidência;
- manter source_code, source_document_id, monitoring_output_id, run_id e payload_hash.

### company_feature_current

Último valor válido por empresa e feature.

Uso esperado:

- alimentar dashboard;
- alimentar ranking;
- alimentar lead_score_snapshots;
- evitar recalcular tudo para visão executiva.

### copilot_context_documents

Documentos textuais prontos para embedding e RAG.

Cada linha deve ter empresa, fonte, documento de origem, conteúdo, evidência, confiança e status de embedding.

## Funções criadas

### upsert_company_feature_snapshot

Insere snapshot histórico e atualiza company_feature_current se o dado novo for mais recente.

Exemplo:

```sql
select public.upsert_company_feature_snapshot(
  p_company_id := 'COMPANY_ID',
  p_feature_key := 'fidc_fit_score',
  p_feature_value_numeric := 82,
  p_confidence := 0.87,
  p_evidence_url := 'https://exemplo.com/noticia',
  p_source_code := 'src_google_news_rss',
  p_source_document_id := 'SOURCE_DOCUMENT_ID'
);
```

### build_copilot_context_from_source_document

Cria um documento de contexto para Copilot somente se source_documents.quality_status = passed.

```sql
select public.build_copilot_context_from_source_document('SOURCE_DOCUMENT_ID');
```

### match_copilot_context_documents

Busca vetorial com filtro opcional por empresa, limite de resultados e confiança mínima.

## Regra de ouro

Nada entra no Copilot se não passou pelo quality gate.

Fluxo esperado:

```text
source_documents
→ run_source_document_quality_gate
→ quality_status = passed
→ build_copilot_context_from_source_document
→ worker de embedding
→ match_copilot_context_documents
→ Copilot com citação/evidência
```

## Próximos passos

1. Criar worker para transformar copilot_context_documents com embedding_status pending em embedding real.
2. Criar materialized view de ranking usando company_feature_current.
3. Alimentar features a partir de company_signals e qualification_snapshots.
4. Expor no frontend uma aba de evidências/features na Company Detail.
