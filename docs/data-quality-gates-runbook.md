# Data Quality Gates Runbook — Frente D / D5 mínimo

## Objetivo

Impedir que documentos brutos inválidos avancem para sinais, enrichment, score, tese e Copilot.

A migration `023_data_quality_gates_minimum.sql` cria duas funções:

- `run_source_document_quality_gate(source_document_id)`
- `run_pending_source_document_quality_gates(limit)`

Elas usam `source_catalog.schema_contract` para validar `source_documents`.

## O que o gate valida

1. **Completude**
   - Verifica se todos os campos de `schema_contract.required` existem no documento.
   - Procura o campo no registro, em `raw_payload` e em `normalized_payload`.

2. **Validade**
   - Documento precisa ter `document_type`.
   - `canonical_url`, quando existir, precisa começar com `http://` ou `https://`.
   - Documento precisa ter `source_id`.

3. **Frescor**
   - Compara `captured_at` / `observed_at` / `published_at` com `source_catalog.freshness_sla_hours`.

4. **Unicidade**
   - Usa `payload_hash` ou `content_hash`.
   - Duplicidade forte derruba o gate.

5. **Drift mínimo**
   - Se a fonte não tiver contrato com `required`, o documento fica em revisão e marca drift.

## Resultados possíveis

| Resultado | Efeito |
| --- | --- |
| `allow` | Documento passa. `quality_status = passed`. |
| `review` | Documento fica em revisão. Não deve ser promovido automaticamente para gold. |
| `quarantine` | Documento vai para `source_quarantine` e `quality_status = quarantined`. |

## Como rodar no Supabase SQL Editor

### Rodar um documento específico

```sql
select public.run_source_document_quality_gate('SOURCE_DOCUMENT_ID_AQUI');
```

### Rodar lote pendente

```sql
select *
from public.run_pending_source_document_quality_gates(100);
```

## Como auditar

### Últimos gates executados

```sql
select *
from public.data_quality_runs
order by started_at desc
limit 50;
```

### Documentos em quarentena

```sql
select *
from public.source_quarantine
where resolved_at is null
order by created_at desc;
```

### Saúde das fontes

```sql
select *
from public.source_health
order by updated_at desc;
```

## Próxima evolução

1. Plugar o gate no fluxo de captura logo depois de gravar `source_documents`.
2. Criar job agendado via `pg_cron` ou worker Edge Function.
3. Exibir `source_health` no frontend de Sources/Monitoring.
4. Bloquear derivação para `company_signals`, `enrichments`, `qualification_snapshots` e `vector_documents` quando `quality_status <> 'passed'`.
