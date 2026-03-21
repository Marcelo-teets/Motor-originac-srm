# Arquitetura final consolidada

## Base oficial escolhida
Sem remotes/PRs configurados localmente, a única base executável encontrada foi a branch `work` com o scaffold mínimo inicial. A consolidação oficial foi feita em cima dessa branch, eliminando caminhos paralelos inexistentes no clone atual e transformando o repositório em monorepo canônico com `frontend/`, `backend/`, `db/`, `config/`, `connectors/`, `agents/`, `docs/` e `scripts/`.

## Stack
- Frontend: React + Vite.
- Backend: Node + Express + TypeScript.
- Banco: Supabase/Postgres com DDL canônico em `db/schema.sql`.
- Conectores: arquitetura API-first com camadas `http`, `rss`, `sitemap`, `scraper` e `normalizers`.
- Agentes: módulos explícitos com persistência para definições, execuções, passos, outputs e validações.

## Status da implementação
- **Real**: dashboard, leads/companies, company detail, qualification model v1, lead score v1, catálogo de agentes, ranking v2, DDL canônico.
- **Parcial**: monitoring, pipeline/activities/tasks, conectores prioritários, APIs mutáveis (persistência ainda em memória).
- **Hardcoded**: catálogos, thresholds, pesos, buckets, rationales base, seeds de fontes.
- **Mockado**: login demo, fallback de frontend e parte das respostas de conectores externos.
- **Planejado**: integração Supabase real, ingestion contínua, learning loops automáticos.
