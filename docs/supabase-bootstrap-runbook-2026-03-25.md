# Supabase Bootstrap Runbook — 2026-03-25

## Objetivo
Subir a base real do Motor de Originação no Supabase e validar o caminho crítico do MVP para POC.

## Premissas
- projeto Supabase oficial: `hdghpmssudrqhsbvrdyt`
- backend configurado para usar Supabase
- migrations do repositório disponíveis localmente

## Variáveis obrigatórias
Backend:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `USE_SUPABASE=true`
- `BOOTSTRAP_SUPABASE=true` apenas se a intenção for semear no bootstrap

Frontend:
- `VITE_API_BASE_URL`

## Ordem recomendada
### 1. Validar schema canônico
Aplicar o schema/migrations do repositório.

Referências no repo:
- `db/schema.sql`
- migrations em `db/migrations/`

### 2. Confirmar tabelas mínimas para a POC
Core:
- `companies`
- `search_profiles`
- `search_profile_filters`
- `source_catalog`
- `monitoring_outputs`
- `company_signals`
- `enrichments`
- `qualification_snapshots`
- `company_patterns`
- `score_snapshots`
- `lead_score_snapshots`
- `pipeline`
- `activities`

ABM:
- `account_stakeholders`
- `touchpoints`
- `objection_instances`
- `account_momentum_snapshots`
- `commercial_priority_snapshots`

### 3. Rodar seed base
A seed base deve garantir pelo menos:
- source catalog
- pattern catalog
- search profiles mínimos
- companies seedadas
- enrichment seedado
- signals seedados
- touchpoints/stakeholders/objections mínimos

### 4. Criar usuário de teste
Criar pelo menos um usuário para a POC conseguir:
- autenticar
- navegar
- executar recálculo

### 5. Validar bootstrap do backend
Subir o backend e confirmar que o bootstrap não falha silenciosamente.

## Smoke tests obrigatórios
### Auth
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`

### Product core
- `GET /dashboard/summary`
- `GET /companies`
- `GET /companies/:id`
- `POST /companies/:id/qualification/recalculate`
- `GET /rankings/v2`

### Monitoring
- `POST /monitoring/run/company/:id`
- `GET /monitoring/outputs`

### Pipeline / activities
- `GET /pipeline`
- `GET /activities`
- `POST /pipeline/company/:id/move`
- `POST /activities`

### ABM
- `GET /abm/war-room/weekly`
- `GET /abm/companies/:id/stakeholders`
- `GET /abm/companies/:id/touchpoints`
- `GET /abm/companies/:id/objections`
- `GET /abm/companies/:id/pre-call-briefing`

### Cockpit readiness
- `GET /mvp-readiness`
- `GET /company-intelligence/:id/summary`
- `GET /company-decision-memo/:id`
- `GET /qualification-intelligence-bridge/:id`

## Critério de aceite do bootstrap
O bootstrap está aprovado quando:
1. login funciona
2. dashboard responde
3. companies responde com dados
4. company detail responde com score, thesis e patterns
5. ranking responde
6. monitoring gera outputs
7. ABM responde
8. pipeline e activities respondem
9. readiness/intelligence do cockpit respondem

## Observação operacional
Se qualquer rota crítica responder só com fallback enquanto o banco está configurado, tratar como defeito do caminho crítico da POC.