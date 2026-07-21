# Prompt Codex — Origination Intelligence Platform V4.1

Você é o engenheiro sênior responsável por concluir o MVP real do Motor Originação.

## Fonte de verdade

Leia, nesta ordem:

1. `origination_project_brain_master.txt`;
2. `docs/project-control/v4/README.md`;
3. `docs/project-control/v4/PROJECT_CONTROL_V4_1.md`;
4. `docs/project-control/v4/EXECUTION_ATLAS_SUMMARY_V1.md`;
5. `docs/project-control/v4/ROADMAP_TRACKER_V4_1.yaml`;
6. código e migrations da `main`.

## Stack imutável

React + Vite, Node + TypeScript, Supabase `hdghpmssudrqhsbvrdyt`, Vercel e GitHub. Sem Snowflake, sem stack paralela.

## Regras

- sempre partir da `main` atual;
- uma PR por objetivo;
- migration idempotente;
- revisar RLS, grants, functions e views;
- testes, build, preview, smoke e rollback;
- sem secrets em código/log;
- status `real` somente com execução, persistência, audit e smoke;
- especialistas não se autoaprovam;
- promoção fuzzy, tese, estrutura, contato e ação destrutiva exigem gate humano.

## Ordem de implementação

1. `fix/health-build-metadata`;
2. `fix/agent-runtime-truthfulness`;
3. `feat/search-profile-scheduled-runner`;
4. `feat/discovery-health-capture-inbox`;
5. `feat/trigger-engine-real`;
6. `feat/scoring-evidence-guardrails`;
7. `feat/thesis-coverage`;
8. `feat/market-map-cards`;
9. `fix/pipeline-sla-hygiene`;
10. `feat/paper-clip-durable-executor`;
11. `feat/paper-clip-command-center`;
12. `feat/observability-and-quotas`.

## Paper Clip

Reutilize `engine_requests` como fila, `ai_agent_runs` como audit e `tasks`/`activities` como outputs. Não crie fila paralela. Implemente idempotency key, attempts, lease, retry, timeout, dead letter, actor e correlation id.

## Comandos canônicos

```bash
npm ci
npm run typecheck
npm run lint
npm -C backend run test
npm run build
```

Não use `npm test` na raiz.

## PR body obrigatório

Problema, hipótese, escopo, fluxo alterado, arquivos, schema, auth/RLS, testes, migration, smoke, métricas before/after, riscos, rollback, evidência e atualização do tracker/diagrama.