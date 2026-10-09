# Handoffs por agente — Planejamento V5

Cada bloco abaixo é um prompt pronto para colar. Todos herdam as regras do `PROMPT_EXECUCAO_V5.md` §1: reconhecimento ao vivo, uma PR por objetivo, schema só via `db/neon/*.sql` com parity, nada de SQL inventado, nenhum segredo em texto.

| Agente | Papel neste projeto | Pode | Não pode |
| --- | --- | --- | --- |
| **Claude** | Reconhecimento, Neon (SQL de leitura, branches, validação), PRs de código e docs, deploy via workflow | `gh api` REST, Neon MCP, Vercel MCP (leitura), dispatch de workflows | GraphQL do GitHub, apagar branches Git, alterar env da Vercel |
| **Codex** | PRs de código grandes (frontend, serviços novos) | Commits e PRs no repo | Acesso a Neon/Vercel ao vivo |
| **GPT (navegador)** | Tudo que exige dashboard autenticado | Vercel env vars, Redeploy pelo dashboard, integrações | Merge sem aprovação do Marcelo |
| **Marcelo** | Decisões, merges, janela de bootstrap | — | — |

---

## H-01 · GPT/dashboard — chaves de IA na Vercel (F3-01 embeddings, F3-04 agente/Copilot)

```text
Contexto: projeto Vercel motor-originac-srm (prj_hsB473e7bNF0xOd6CEUwo7WFgNYs, team team_PJwucES3YmFbxf57HE52Bw0v).
Tarefa: em Settings → Environment Variables, criar para o ambiente Production (e Preview, se o Marcelo pedir):
  1. VOYAGE_API_KEY  — valor fornecido pelo Marcelo (conta Voyage AI). Lido por api/knowledge-embedding-worker.ts (gera embeddings)
     e serverless/knowledge-search.ts (busca densa).
  2. AI_GATEWAY_API_KEY — valor fornecido pelo Marcelo. Lido por backend/src/ai/knowledgeLearningAgent.ts; sem ela o código tenta
     VERCEL_OIDC_TOKEN (OIDC da Vercel). Só criar se o OIDC não estiver habilitado no projeto.
Não colar valores em chat, issue ou PR. Não alterar nenhuma outra variável.
Depois: avisar o Claude, que dispara vercel-production-deploy.yml (RB-01) e habilita knowledge-embedding-coverage.yml (RB-02).
Aceite: as duas chaves aparecem na lista de envs de Production (só o nome); o deploy seguinte fica READY.
```

## H-02 · GPT/dashboard — `AGENTETOME_API_KEY` (opcional, D-05)

```text
Só se o Marcelo decidir manter o Agentetome no escopo.
Vercel → motor-originac-srm → Environment Variables → Production: criar AGENTETOME_API_KEY com o valor fornecido pelo Marcelo.
Depois: o Claude abre PR devolvendo o cron horário em .github/workflows/neon-scheduled-jobs.yml (desligado pela #563) e o teste correspondente.
Aceite: dispatch manual de neon-scheduled-jobs.yml com jobs=agentetome termina em success.
```

## H-03 · GPT/dashboard — janela de bootstrap do admin (D-07)

```text
Seguir RUNBOOKS_OPERACAO_V5.md, RB-03, com o Marcelo presente.
Passos que cabem ao GPT:
  (3) Vercel → Production env: MOTOR_AUTH_BOOTSTRAP_ENABLED=true → Deployments → produção atual → Redeploy (sem rebuild de cache).
Não usar o workflow vercel-production-deploy.yml nesse passo: ele força a variável para false.
Depois que o Marcelo virar god_mode, avisar o Claude, que roda o RB-01 (o deploy oficial volta a variável para false).
```

## H-04 · Codex — painel de frescor de dados (F1-06)

```text
Repo Marcelo-teets/Motor-originac-srm, branch nova a partir da main atual: feat/sources-data-freshness-panel.
Objetivo: no /sources do frontend, um bloco "Frescor dos dados" com uma linha por fonte:
  fonte, status, último sucesso, última falha, falhas consecutivas, horas desde o último sucesso vs. SLA.
Fonte dos dados: tabela public.source_health, colunas reais (conferidas em 09/10/2026):
  source_code, source_name, source_tier, health_status, reliability_score, freshness_sla_hours,
  last_success_at, last_failure_at, consecutive_failures, last_drift_detected_at, average_latency_ms,
  yield_signals_per_run, cost_units_last_30d, notes, updated_at.
Restrições:
  - Plano Vercel Hobby: no máximo 12 funções por deploy. NÃO criar arquivo novo em api/; reutilizar a rota que já atende /sources no backend (procure "sources" em backend/src/server.ts e api/).
  - Leitura via o adaptador existente (backend/src/lib/postgres.ts, NeonPostgresClient.select). Não escrever SQL cru no frontend.
  - Ordenar pela fonte mais atrasada primeiro (last_success_at nulls first).
  - Linha vermelha quando horas desde o sucesso > freshness_sla_hours.
Testes: unitário do serviço/rota (formato da resposta) e npm run lint, npm run test:backend, npm run test:frontend-quality.
Não inventar colunas. Se precisar de algo que não existe em source_health, pare e descreva no PR.
Aceite: PR com CI verde e print do bloco rodando contra dados de exemplo.
```

## H-05 · Codex — revisão humana de candidatos com SLA (F2-04)

```text
Branch: feat/candidate-review-queue-sla.
Objetivo: na tela que lista discovered_company_candidates, destacar os candidatos com candidate_status='captured' há mais de 72 h
(coalesce(updated_at, captured_at, created_at) < now() - interval '72 hours') e ordenar por confidence desc.
Colunas reais de discovered_company_candidates: id, search_profile_run_id, search_profile_id, company_name, legal_name, website,
normalized_domain, cnpj, cnpj_valid, geography, segment, subsegment, company_type, candidate_role, credit_product, target_structure,
source_ref, source_url, evidence_summary, receivables, confidence, candidate_status, company_id, dedupe_key, raw_payload, metadata,
captured_at, promoted_at, created_at, updated_at.
A promoção continua humana: não criar promoção automática.
Aceite: CI verde; contagem "fora do SLA" igual ao bloco 3 de docs/project-control/v5/KPIS_V5.sql.
```

## H-06 · Claude — sequência pós-limpeza (F1 → F2)

```text
Pré-requisitos: limpeza aprovada e executada (RUNBOOK_INCIDENTE_STORAGE_2026-10-09.md §3); PRs #568, #569, #570 e #571 mergeadas; migração
db/neon/20261009_neon_cvm_fre_headcount_sync.sql aplicada pelo fluxo de parity.
1. RB-01 (deploy da main).
2. RB-02 onda A: capture.yml → search-profile-discovery.yml → capital-market-ingestion.yml com dataset=cvm_company_fre.
3. Conferir KPIS_V5.sql blocos 2 e 4: com_headcount > 0 para companhias abertas.
4. capital-market-ingestion.yml com dataset=cvm_fidc_monthly. Conferir:
   select count(distinct entity_cnpj) from capital_market_entity_links where dataset_code='cvm_fidc_monthly' and entity_role='assignor';
5. Rodar materializeDerivedIntelligence (dispatch de neon-scheduled-jobs.yml com jobs=derived-materialization) e medir a métrica-norte (bloco 1).
6. Registrar o snapshot no tracker e publicar o relatório da fase.
```
