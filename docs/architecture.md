# Arquitetura final consolidada

## Base oficial preservada
A base continua sendo o monorepo oficial com `frontend/` React/Vite, `backend/` Node/Express, `db/schema.sql`, `config/`, `connectors/`, `agents/` e `docs/`. Esta PR evolui exclusivamente em cima da `main` atual, sem reabrir arquiteturas paralelas.

## Backend consolidado
- **Runtime**: Node + Express + TypeScript.
- **Persistência**: repositório com modo `memory` por padrão e modo `supabase` via REST (`SUPABASE_URL` + chave) quando `USE_SUPABASE=true`.
- **Services**: `PlatformService` centraliza qualification, patterns, lead score, thesis, market map, monitoring outputs e ranking v2.
- **Agents reais nesta PR**:
  - `qualification_agent`: gera `qualification_snapshots`, `score_snapshots`, rationale e `evidence_payload`.
  - `pattern_identification_agent`: aplica catálogo inicial de 10 padrões e persiste `company_patterns`.
  - `lead_score_agent`: combina qualification, impacto de patterns, source confidence e trigger strength.
  - `monitoring_agent`: usa conectores de BrasilAPI, RSS e website monitoring com fallback controlado.

## Portes conceituais dos PRs antigos
- **PR #5**: entity resolution leve via `source_trace`, source governance, monitoring service, scoring/thesis/market map e contratos conceituais refletidos nos serviços e schema.
- **PR #7**: layout/frontend com widgets executivos, badges, cartões, tabelas e hierarquia visual mais forte.
- **PR #3**: estrutura rica de `CompanyDetailPage`, incluindo score history, thesis, market map, monitoring e actions.
- **PR #2**: racional do Ranking V2 agora pondera qualification, lead score, pattern impacts, trigger strength e source confidence.
- **PR #1**: persistência conceitual para snapshots, history, monitoring outputs e orchestration flow preservada na arquitetura atual.
- **PR #9**: sementes iniciais, testes/checks leves e organização pragmática de repositórios locais.

## Conectores iniciais
- **Real**: BrasilAPI CNPJ, Google News RSS básico, website monitoring básico via fetch HTML.
- **Parcial**: CVM RSS, orchestration de monitoring state.
- **Mockado**: LinkedIn hiring signals e qualquer fonte que dependa de credenciais externas ou scraping mais frágil.

## Mock vs real
- **Real**: qualification engine, pattern engine, ranking v2, catálogo principal de fontes e estrutura de persistência suportada por Supabase REST.
- **Parcial**: monitoring contínuo, pipeline mutável, algumas rotas mutáveis e CVM RSS.
- **Hardcoded**: seed catalog inicial, pesos, thresholds e textos base de tese/racional.
- **Mockado**: auth demo, LinkedIn, partes do frontend ainda alimentadas por mocks locais para evitar telas vazias.
