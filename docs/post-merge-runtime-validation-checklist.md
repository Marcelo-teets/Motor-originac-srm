# Post-Merge Runtime Validation Checklist

## Objetivo

Checklist para validar, após o merge da cadeia de PRs, se o runtime de captura está apto a alimentar o pipeline institucional de originação.

## Ordem de merge

1. #96 — source infrastructure
2. #98 — official loaders
3. #100 — source health command center
4. #101 — source health backend snapshot
5. #103 — connector runs by observed source
6. #104 — source health run code matching
7. #105 — runtime persistence diagnostics
8. #106 — runtime diagnostics validator

## Validações obrigatórias

### 1. Health do runtime

Confirmar que o health de captura retorna status real ou parcial explicado, com tabelas acessíveis e core runtime pronto.

Critérios:

- Supabase configurado.
- Tabelas core acessíveis.
- `source_connector_runs` acessível.
- `monitoring_outputs` acessível.
- `company_signals` acessível.

### 2. Execução do runtime

Executar um run manual de captura em ambiente autenticado.

Critérios:

- Response contém `operational.status`.
- Response contém `operational.httpStatus`.
- Response contém `operational.decision`.
- Response contém `operational.nextAction`.
- `data.persisted.runsWritten` é numérico.
- `data.persisted.outputsWritten` é numérico.
- `data.persisted.signalsWritten` é numérico.
- `data.persisted.enrichmentsWritten` é numérico.

### 3. Persistência no Supabase

Validar tabelas após o run.

Critérios:

- `source_connector_runs` recebeu linhas novas.
- linhas novas possuem `metadata.operational`.
- runs por fonte possuem `metadata.sourceCode` ou `metadata.sourceCodes` quando aplicável.
- `monitoring_outputs` recebeu outputs novos quando houver evidência.
- `company_signals` recebeu sinais novos quando houver evidência.
- `enrichments` recebeu enrichments novos quando aplicável.

### 4. Source Health Snapshot

Validar o endpoint de snapshot de fontes.

Critérios:

- fontes oficiais aparecem primeiro.
- fontes com runs por `sourceCode` são reconhecidas.
- `runCount` aparece preenchido para fontes executadas.
- `lastRunStatus` aparece preenchido para fontes executadas.
- `runOutputsWritten` e `runSignalsWritten` refletem a execução.
- fontes sem evidência recente mostram próxima ação clara.

### 5. Frontend

Validar a tela de fontes.

Critérios:

- Source Health Command Center carrega.
- Card de fontes oficiais priorizadas carrega.
- Próximas ações por fonte aparecem.
- Catálogo completo permanece navegável.
- Não há fallback silencioso para mock sem aviso.

## Go / No-Go

### Go

- Runtime retorna diagnóstico operacional claro.
- Persistência real no Supabase confirmada.
- Source Health reconhece runs por `sourceCode`.
- Tela de fontes mostra saúde das fontes com decisões acionáveis.

### No-Go

- Runtime sem `operational` no response.
- Runs sem persistência em `source_connector_runs`.
- Source Health sem correlação por fonte.
- Frontend usando fallback/mock sem explicitar modo parcial.

## Próxima evolução depois do Go

Conectar `search_profiles` ao runtime institucional para executar o pipeline:

Search Profile → Sources → Monitoring → Raw Outputs → Signals → Enrichment → Qualification → Patterns → Score → Ranking → Pipeline
