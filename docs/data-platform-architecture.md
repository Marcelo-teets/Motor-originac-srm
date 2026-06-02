# Frente D — Plataforma de Dados de Originação

## Objetivo

Transformar a captura atual em uma plataforma institucional de dados para originação de crédito estruturado, sustentando score, tese, ranking e Copilot com evidência rastreável.

Esta frente segue o cérebro mestre do projeto: Brasil-only, foco em middle market tech/startups, empresas com recebíveis, produtos de crédito, funding gap e fit para FIDC/DCM.

## Arquitetura alvo

A arquitetura é medallion dentro do Supabase/Postgres, sem stack paralela:

```text
Coleta -> Bronze/raw -> Silver/tratamento -> Gold/decisão
```

### Bronze/raw

Tabelas principais:

- `source_connector_runs`
- `source_documents`
- `monitoring_outputs`
- `source_quarantine`

Regras:

- raw é append-only;
- toda entrada tem `source_code`, `run_id`, `captured_at`, `payload_hash` e evidência quando disponível;
- payload inválido vai para quarentena, não para gold;
- reprocessamento deve ser possível a partir de `source_documents`.

### Silver/tratamento

Tabelas principais:

- `company_signals`
- `enrichments`
- `company_entity_aliases`
- `data_quality_runs`

Regras:

- fato sem origem não deve subir;
- toda inferência relevante precisa de `evidence_payload` ou `evidence_url`;
- CNPJ é chave canônica quando disponível;
- aliases ficam em `company_entity_aliases`.

### Gold/decisão

Tabelas principais:

- `companies`
- `qualification_snapshots`
- `lead_score_snapshots`
- `ranking_v2`
- `thesis_outputs`
- `vector_documents`

Regras:

- score precisa ser explicável, versionável e auditável;
- tese deve apontar para sinais/evidências;
- Copilot deve citar contexto vindo de `vector_documents` e fatos curados.

## D0 — Fundação entregue nesta PR

A migration `022_data_platform_d0_d1_foundation.sql` adiciona:

1. Campos de contrato em `source_catalog`:
   - `source_tier`
   - `geography_scope`
   - `collection_method`
   - `cadence`
   - `priority_score`
   - `reliability_score`
   - `schema_contract`
   - `contract_version`
   - `freshness_sla_hours`
   - `pii_classification`
   - `cost_policy`
   - `drift_policy`

2. Tabelas de governança:
   - `source_schema_versions`
   - `data_quality_runs`
   - `source_health`
   - `source_quarantine`

3. Campos de lineage em tabelas silver/gold:
   - `run_id`
   - `captured_at`
   - `confidence`
   - `evidence_url`
   - `payload_hash`
   - `source_document_id`

## D1 — Catálogo Brasil-only entregue nesta PR

A migration cadastra fontes por `metadata.code`, que passa a ser a chave estável para resolver o drift entre ambientes onde `source_catalog.id` é `text` e ambientes onde é `uuid`.

Fontes iniciais:

| Tier | Categoria | Fontes |
| --- | --- | --- |
| 1 | Regulatório/mercado | CVM Dados Abertos, CVM FIDC Informes, B3, ANBIMA, BCB SGS |
| 2 | Crédito/recebíveis | Registradoras autorizadas, SCR autorizado, SEFAZ NF-e autorizada |
| 3 | Jurídico/fiscal | CENPROT, PGFN, TST CNDT, Judicial RJ/Falência, Diário Oficial |
| 4 | Cadastral/societário | Receita CNPJ Dados Abertos, BrasilAPI CNPJ |
| 5 | Comercial/alternativo | Company Website Deep, Google News RSS, VC Portfolio Monitor, SimilarWeb, Lusha, Apollo, AI Vibe, Fireflies, CB Insights |

## Regras de qualidade

Gates mínimos para D5, já preparados em D0:

1. **Completude**: campos obrigatórios do contrato estão presentes.
2. **Validade**: datas, CNPJ, URL e tipos monetários são parseáveis.
3. **Frescor**: `captured_at` respeita `freshness_sla_hours`.
4. **Consistência**: fonte não contradiz fonte oficial sem sinalizar conflito.
5. **Unicidade**: `payload_hash` evita duplicidade.
6. **Drift**: mudança em schema ou distribuição gera `data_quality_runs.drift_detected = true`.

## Playbook operacional

### 1. Ao criar nova fonte

1. Inserir linha em `source_catalog` com `metadata.code`.
2. Criar contrato em `schema_contract`.
3. Definir tier, cadência, confiabilidade, política de custo e PII.
4. Registrar versão em `source_schema_versions`.
5. Criar gate de qualidade correspondente.

### 2. Ao capturar dado

1. Criar `source_connector_runs`.
2. Gravar raw em `source_documents` com hash.
3. Rodar validação.
4. Se falhar, gravar em `source_quarantine`.
5. Se passar, derivar `company_signals`, `enrichments` e snapshots.

### 3. Ao alimentar score/tese/Copilot

1. Consumir somente dados com lineage.
2. Dar peso maior para fontes Tier 1 e 2.
3. Exigir evidência para qualquer recomendação comercial.
4. Diferenciar observado, inferido e estimado.

## Próximas PRs recomendadas

1. **D5 mínimo**: implementar job SQL/Node para gerar `data_quality_runs` por fonte e bloquear dados inválidos.
2. **D6 feature store**: criar `feature_store` materializada para score/qualificação.
3. **D6 vetor real**: expandir `vector_documents` com metadados, embeddings e RPC com filtro por empresa.
4. **D2/D3 worker**: introduzir fila `pgmq` e worker Edge Function para coleta longa.
5. **D4 entity resolution**: consolidar CNPJ + domínio + aliases fuzzy com revisão humana.
