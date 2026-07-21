# Origination Intelligence Platform — Project Control V4.1

**Data-base:** 21/07/2026  
**Repositório:** `Marcelo-teets/Motor-originac-srm`  
**Main auditada:** `a38d45f6734fad489af75f32067251147d4bbe0b`  
**Supabase:** `hdghpmssudrqhsbvrdyt`  
**Vercel:** `prj_hsB473e7bNF0xOd6CEUwo7WFgNYs`

## 1. Missão

Descobrir empresas, detectar mudanças, explicar impacto financeiro, indicar a estrutura de crédito, justificar o timing, recomendar a próxima ação e converter inteligência em pipeline/operação real.

## 2. Stack imutável

- React + Vite;
- Node + TypeScript;
- Supabase;
- Vercel;
- GitHub;
- Brasil-only;
- sem Snowflake;
- sem stack paralela.

## 3. Estado real

| Objeto | Linhas |
|---|---:|
| companies | 8 |
| search_profiles | 1 |
| search_profile_runs | 0 |
| discovered_company_candidates | 0 |
| company_discovery_links | 0 |
| monitoring_outputs | 13.795 |
| company_signals | 16.268 |
| enrichments | 3.899 |
| qualification_snapshots | 904 |
| lead_score_snapshots | 904 |
| ranking_v2 | 88 |
| trigger_events | 0 |
| thesis_outputs | 3 |
| market_map_cards | 0 |
| pipeline | 8 |
| tasks | 6 |
| activities | 13 |
| engine_requests | 0 |
| ai_agent_runs | 0 |
| source_catalog | 61 |
| source_connector_runs | 1.032 |

Dos connector runs, 101 estão `completed` e 931 `partial`.

## 4. Truth table

| Capability | Estado | Próximo gate |
|---|---|---|
| Auth | partial | smoke positivo e autorização por papel |
| Sources | real/partial | taxonomia e redução de partials |
| Monitoring | real | qualidade e materialidade |
| Search Profiles | partial | primeira execução e scheduler |
| Capture Inbox | partial | 50 candidatos |
| Company Master | partial | 20+ promoções |
| Qualification | real/partial | top 20 atualizados e revisados |
| Patterns | partial | top 20 cobertos |
| Ranking | real/partial | triggers e explicabilidade |
| Triggers | não operacional | engine e eventos reais |
| Thesis | stale | top 20 aprovadas |
| Market Map | mock | cards persistidos |
| Pipeline | partial | due date, contato, ticket e mandato |
| Tasks/Activities | stale | limpar seis tarefas vencidas |
| Paper Clip | mock/partial | fila, worker, retry e audit |
| Agents | mock/partial | endpoints ligados a tabelas reais |
| Deployment | partial | health com SHA/ambiente/deployment |

## 5. Pipeline oficial

```mermaid
flowchart LR
  SP[Search Profile] --> RUN[Durable Run]
  RUN --> CI[Capture Inbox]
  CI --> ER[Entity Resolution]
  ER --> CO[Company Master]
  CO --> MON[Monitoring]
  MON --> SIG[Signals]
  SIG --> TRG[Triggers]
  TRG --> Q[Qualification]
  Q --> PAT[Patterns]
  PAT --> SC[Score/Lead Score]
  SC --> TH[Thesis]
  TH --> MM[Market Map]
  MM --> R[Ranking]
  R --> P[Pipeline]
  P --> PC[Paper Clip]
  PC --> TA[Tasks/Activities]
  TA --> FB[Feedback]
  FB --> SP
```

## 6. P0 — Verdade operacional

Entregas:

1. `/api/health` com `gitSha`, `environment` e `deploymentId`;
2. canonical SHA igual à `main`;
3. auth matrix 401/403/200;
4. remover runs/validations/health hard-coded de agents;
5. Market Map não pode retornar `generated: true` sem persistência;
6. Paper Clip não pode aparecer como real enquanto estiver em memória;
7. decidir acesso de `source_treatment_rules` sem criar policy permissiva artificial;
8. habilitar leaked password protection quando permitido;
9. remover warning `DEP0169`;
10. atualizar issue #164.

Gate: zero falso `real`, zero Security Advisor ERROR e produção comprovada como `main`.

## 7. P1 — Discovery e Capture Inbox

Perfil canônico: `5e36f366-dc57-4d4f-9b45-9a38098a0784`.

Entregas:

- canário manual autenticado;
- scheduler dos profiles ativos;
- lock, lease, retry e idempotência;
- resultados por fonte e taxonomia partial;
- dedupe CNPJ → domínio → nome/aliases;
- Capture Inbox;
- promoção revisável;
- transaction company/link/candidate;
- health/funnel;
- 50 candidatos e 20 promoções com 100% lineage.

## 8. P2 — Intelligence

- catálogo de triggers;
- fingerprint e corroboration;
- staleness e evidence uniqueness;
- recálculo seletivo;
- qualification/pattern/score/ranking top 20;
- thesis top 20;
- Market Map top 20;
- evidence panel;
- revisão humana e versionamento.

## 9. P3 — Comercial e Paper Clip

- resolver/replanejar seis tarefas vencidas;
- owner, ação, due date, contato, ticket e mandate status;
- audit de transição;
- `engine_requests` como fila;
- `ai_agent_runs` como audit;
- `tasks`/`activities` como output;
- allowlist, lease, retry, idempotency e dead letter;
- command center;
- e2e.

## 10. P4 — Escala

- quotas e custos;
- backfills;
- comparables;
- Copilot com evidence;
- source ROI gate.

## 11. Sequência de PRs

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

## 12. Gate universal de PR

```bash
npm ci
npm run typecheck
npm run lint
npm -C backend run test
npm run build
```

Migration, RLS/grants, advisors, preview, smoke, rollback, documentação e evidência são obrigatórios. `npm test` não existe na raiz.

## 13. North Star

**Leads prioritários convertidos em próxima ação comercial qualificada por semana.**