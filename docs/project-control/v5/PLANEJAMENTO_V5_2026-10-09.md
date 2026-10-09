# Motor Originação SRM — Planejamento V5

**Data-base:** 09/10/2026 13:36 BRT (reconciliada ao vivo; plano original 11:00 BRT)
**Substitui:** `docs/project-control/v4/` (V4.1, 21/07/2026) e `STATUS_E_ROADMAP_2026-07-17.md` — ambos escritos sobre o Supabase, hoje fora do runtime.
**Tracker máquina-legível:** `ROADMAP_TRACKER_V5.yaml` (nesta pasta).

| Superfície | Identificador | Estado verificado em 09/10 |
| --- | --- | --- |
| GitHub | `Marcelo-teets/Motor-originac-srm`, `main@0d2e3cf` (09/10 13:33 BRT) | #550 `mergeable_state=clean`, CI/parity verdes; control plane V5 original ainda está na PR #556, não na `main` |
| Vercel | `prj_hsB473e7bNF0xOd6CEUwo7WFgNYs` | Produção continua em `ab90cac`; `main` agora é `0d2e3cf` — **produção divergente da main** |
| Neon | `steep-poetry-38942951` (sa-east-1, Free), branch `production` | 21 MB; **10/10 branches**; active time no ciclo = **16,89 h / 85 h** |
| Supabase | `hdghpmssudrqhsbvrdyt` | Fora do runtime desde o cutover de 06/10; dados históricos **não recuperados** (último teste: 06/10, REST 402 / banco recusa conexão) |

---

## 1. O que mudou desde a V4.1

A V4.1 assumia Supabase saudável e travava P1–P4 atrás de P0. Desde então:

- **Cutover Supabase → Neon concluído** (06/10, `b68bb11`): runtime, Auth (Neon Managed Auth), migrações e paridade (`neon-runtime-parity.yml`) rodam no Neon. pg_cron foi substituído por `neon-scheduled-jobs.yml`.
- **Revisão de código + Neon aplicada** (#535, #536): RPCs com parâmetros ligados, escrita em lotes, auth endurecida, ~3,7 mil linhas mortas removidas.
- **Gates de decisão comercial** (07–09/10): ICP exige headcount verificado ≥ 50 e gatilho material; RSS de funding com mais de 365 dias fora da fila; gate SQL canônico é a autoridade (`26afa8d`).
- **Paper Clip durável** (`ab06b4a`): execução com lease/idempotência em `engine_requests` + `ai_agent_runs` (era o P3-002 da V4.1).
- **Agente de Intro portado** (`ae6ff26`): registro de evidências, Deal Master determinístico, artefatos com aprovação humana.
- **Loop monitoring → ranking fechado** (`d770c4c`): materialização incremental a cada 15 min.
- **Discovery de portfólios de VC** com hidratação de identidade atrás de revisão humana (`ab90cac`, `3bd20d3`).

Ou seja: a **plataforma está pronta para operar no Neon**; o que falta é **volume de dados reais passando pelo funil**.

---

## 2. Diagnóstico verificado (09/10)

### 2.1 O funil está vazio — e o motivo é concreto

| Etapa | Linhas no Neon | Leitura |
| --- | --- | --- |
| `discovered_company_candidates` | 46 (44 `captured`, 2 `promoted`) | Discovery funciona, mas só rodou manualmente |
| `companies` | 2 (Plano & Plano, Cyrela) | Entidades reais com CNPJ |
| Elegíveis ao gate de decisão | **0** | `company_verified_headcount_floor` = `null` para ambas |
| `score_snapshots` / `lead_score_snapshots` / `ranking_v2` / `pipeline` | **0** | Smoke de 09/10: `consideredCompanies: 0` |
| `company_signals` | 2 | |
| `monitoring_outputs` | 57 (último 08/10 13:04) | |
| `capital_market_events` / `entity_links` / `metrics` | 100 / 55 / 339 | Debêntures SND entrando; delivery depende da #550 |
| `vector_documents` | **0** | RAG sem corpus — denso e lexical vazios |
| `trigger_events`, `thesis_outputs`, `enrichments`, `tasks`, `activities` | 0 | |
| `user_profiles` | 0 | Nenhum perfil de usuário materializado no Neon |

**Métrica-norte** (“empresas reais com sinal, fator e score”): **0**.

### 2.2 As causas, em ordem de impacto

1. **16 workflows de dados estão `disabled_manually`** desde ~23/08 (época da pressão de cota no Supabase): `capture`, `search-profile-discovery`, `capital-market-ingestion`, `public-bulk-ingestion`, `cvm-fund-documents-schedule`, `knowledge-embedding-coverage`, `candidate-domain-intelligence`, `candidate-cvm-registry-enrichment`, `strategic-public-data`, `tech-signals-people-capital`, `qsa-fallback-persistence`, `bndes-automatic-datastore`, `finep-source-probe`, `source-activation-probes`, `source-control-sheet-sync`, `source-schedule-audit`. Os dados atuais vieram de execuções manuais/branches `ops/*` em 08–09/10. Os workflows já foram corrigidos para o Neon (`f8e1a3e`), mas continuam desligados.
2. **Gate de ICP sem fonte de headcount.** O gate procura `metadata.icp_headcount_verified_min|employee_count|headcount`, métricas `employee_count`/`linkedin_employee_count` ou `raw_payload.firmographic_evidence.headcountMin`. Nenhum pipeline preenche isso hoje → toda empresa fica inelegível, mesmo sendo real.
3. **Agendador degradado.** `neon-scheduled-jobs.yml` declara cron de 5 min/15 min/hora, mas o GitHub disparou só 32 execuções desde 07/10 (esperado: centenas). Das 32, 24 falharam — a maioria entre 07/10 e a manhã de 08/10, antes da correção de conexão (`ce2dfc5`); a falha mais recente (09/10 09:06 UTC) é o job horário `agentetome` (`AGENTETOME_API_KEY não está configurada`).
4. **Embeddings parados.** `vector_documents` vazio; o worker depende de `VOYAGE_API_KEY` e o workflow de cobertura está desligado.
5. **Dados históricos do Supabase** (≈15 mil sinais, 12 mil outputs, snapshots de julho) seguem presos no projeto antigo.

### 2.3 Orçamento Neon Free

| Recurso | Uso | Limite | Observação |
| --- | --- | --- | --- |
| Branches | **10** | 10 | Regra interna: parar em 9. 6 são `preview/*` criadas pela integração Vercel em 08/10, 1 `vercel-dev` arquivada, 1 `backup/production-20261008` |
| Active time (mês) | ~16,9 h | 85 h | Dia 9 do ciclo → projeção ~58 h com a carga atual; religar captura aumenta |
| Storage lógico | ~46 MB (branch) / 21 MB (db) | 480 MB | Folga ampla |

**Consequência imediata:** a próxima preview da Vercel não consegue criar branch Neon.


### 2.4 Reconciliação ao vivo — 09/10/2026 13:36 BRT

- Baseline reconsultada no Neon: **46 candidatos / 2 promovidos / 2 companies / 0 elegíveis / 0 score_snapshots / 0 ranking_v2 / 0 pipeline / 0 embeddings / 0 user_profiles / 1 usuário Neon Auth / 21 MB**.
- Branches Neon: **10/10**. Confirmadas as 6 `preview/*` criadas pela Vercel, `vercel-dev` arquivada, `backup/production-20261008` e `production`.
- Uso Neon no ciclo: **60.804 s = 16,89 h de active time**; limite do plano: 85 h.
- PR #550 no head `55a62ce5bf1211630f6761cc779a4ce6d966f152`: `mergeable_state=clean`; CI run `37781705235` com job `build-and-typecheck` verde; Neon Runtime Parity run `37781705243` com job `parity` verde. Como o merge exige autorização explícita do Marcelo, o item fica `ready_for_merge`.
- Auth: o único registro em `neon_auth."user"` é `motor-auth-smoke-a4b7a996c0662d3a@example.com`, portanto **não é o usuário do Marcelo**. A coluna temporal real é `"createdAt"` (camelCase), não `created_at`. F0-06 fica bloqueado por decisão antes de qualquer remoção destrutiva.
- V5 original está na PR #556, não na `main`; esta reconciliação cria uma PR nova a partir da `main` atual para tornar o control plane auditável sem reutilizar branch desatualizada.

---

## 3. Metas V5

| Marco | Data | Métrica-norte | Outras metas |
| --- | --- | --- | --- |
| F0 concluída | 16/10 | — | Produção = `main`; branches ≤ 7; agendador 100% verde |
| F1 concluída | 23/10 | ≥ 5 | Candidatos ≥ 300; promovidas ≥ 30; captura agendada ≥ 7 dias seguidos sem falha |
| F2 concluída | 06/11 | ≥ 20 | Cedentes FIDC (CVM) resolvidos ≥ 50; headcount preenchido em ≥ 80% das promovidas |
| F3 concluída | 20/11 | ≥ 40 | `vector_documents` com embedding ≥ 90%; ≥ 1 `trigger_event` real por semana; tese para top 20 |
| F4 concluída | 18/12 | ≥ 60 | 100% do top 20 com dono, próxima ação e prazo; ≥ 1 intro aprovada e enviada |

---

## 4. Fases

### F0 — Higiene operacional (até sex 16/10)

| ID | Ação | Executor | Critério de aceite |
| --- | --- | --- | --- |
| F0-01 | Mergear #550 (roteamento SND → `sync_debentures_snd_delivery`) | Codex/Marcelo | CI + Neon Runtime Parity verdes; delivery SND sem `Unsupported CVM dataset` |
| F0-02 | Promover `main` à produção pelo fluxo manual (`vercel-production-deploy.yml`) | GPT/Marcelo | Deploy READY no SHA da `main`; `/api/health` expõe o mesmo SHA |
| F0-03 | Limpar branches Neon: apagar as 6 `preview/*` (PRs já mergeadas) e a `vercel-dev` arquivada; manter `backup/production-20261008` até F1 | Claude (com aprovação) | ≤ 3 branches |
| F0-04 | Impedir nova enxurrada: desligar criação automática de branch por preview na integração Neon↔Vercel, ou limitar a PRs com label | GPT (dashboard) | Nova preview não cria branch sem pedido |
| F0-05 | `AGENTETOME_API_KEY`: cadastrar na Vercel **ou** tirar o cron `17 * * * *` até haver chave | Marcelo/GPT | 0 falhas do job horário em 24 h |
| F0-06 | Bootstrap de perfil admin no Neon (`user_profiles` = 0) e smoke autenticado (`production-auth-smoke.yml`) | Codex | Login real → perfil ativo; smoke verde |
| F0-07 | **Decisão** sobre o histórico Supabase: tentar 1 vez (liberar cota/suporte + `MOTOR_SUPABASE_DATABASE_URL` + `migration/supabase-recovery/`) **ou** declarar perdido e seguir só com dado novo | Marcelo | Decisão registrada neste arquivo |

### F1 — Religar a captura no Neon, com orçamento (até sex 23/10)

Religar em ondas, sempre com `neon-free-budget-guard.yml` verde entre uma e outra. Cada onda roda primeiro via `workflow_dispatch` e só depois volta ao cron.

| ID | Ação | Critério de aceite |
| --- | --- | --- |
| F1-01 | **Onda A:** `capture.yml`, `search-profile-discovery.yml`, `capital-market-ingestion.yml` | 3 dias seguidos verdes; `monitoring_outputs` e candidatos crescendo diariamente |
| F1-02 | **Onda B:** `cvm-fund-documents-schedule.yml`, `public-bulk-ingestion.yml`, `candidate-domain-intelligence.yml`, `candidate-cvm-registry-enrichment.yml` | Verdes; storage < 200 MB |
| F1-03 | **Onda C:** demais 9 workflows, um a um, só os que têm consumidor ativo; aposentar (apagar do repo) os que não têm | Nenhum workflow `disabled_manually` sem justificativa escrita |
| F1-04 | Tirar o loop de 5/15 min do cron do GitHub (não confiável) → Vercel Cron chamando endpoint protegido por `CRON_SECRET`, ou job único de 15 min que encadeia reprocessamento → resolução → materialização | Execuções reais ≥ 90% das previstas em 48 h |
| F1-05 | Search Profiles: rodar o bootstrap runner (`01c9913`) para os 4 perfis ativos e revisar a fila de promoção | Promovidas ≥ 30 com CNPJ válido |
| F1-06 | Painel de saúde de dados (frescor por fonte, último sucesso, volume/dia) no `/sources` usando `source_connector_runs` + `source_health` | Visível na produção |

### F2 — Universo real e elegibilidade (até sex 06/11)

| ID | Ação | Critério de aceite |
| --- | --- | --- |
| F2-01 | **Fonte de headcount para o gate de ICP** — decidir a fonte (ver §5, D-03) e gravar em `capital_market_metrics`/`metadata` no formato que `company_verified_headcount_floor` já lê | ≥ 80% das promovidas com headcount; as 2 atuais avaliadas |
| F2-02 | Resolver cedentes FIDC a partir dos informes mensais CVM (`capital_market_entity_links` → `companies`) — tese de whitespace nº 1 | ≥ 50 cedentes reais promovidos com CNPJ |
| F2-03 | Materialização ponta a ponta para elegíveis: qualification → patterns → score → lead score → ranking → pipeline | Métrica-norte ≥ 20 |
| F2-04 | Fila de revisão humana (identidade VC/CVM) com SLA: nada parado > 72 h em `captured` | Fila zerada semanalmente |

### F3 — Inteligência explicável (até sex 20/11)

| ID | Ação | Critério de aceite |
| --- | --- | --- |
| F3-01 | `VOYAGE_API_KEY` na Vercel + religar `knowledge-embedding-coverage.yml` + backfill (`voyage-3.5`, 1024 dims; HNSW já preparado) | Embedding ≥ 90% de `vector_documents` |
| F3-02 | Gatilhos materiais reais em `trigger_events` (persistência já existe em `persist_material_trigger_from_signal`) | ≥ 1 por semana, com evidência |
| F3-03 | Tese e market map para o top 20 do ranking | 20/20 com tese datada e fonte |
| F3-04 | Copilot com contexto da empresa (`AI_GATEWAY_API_KEY`), respondendo só com evidência registrada | Conversas reais em `ai_conversations` |
| F3-05 | Radar de duplicata escritural (CERC/Núclea) — tese de whitespace nº 2, começando como fonte em `source_catalog` | Fonte ativa e monitorada |

### F4 — Execução comercial (até sex 18/12)

| ID | Ação | Critério de aceite |
| --- | --- | --- |
| F4-01 | Higiene de pipeline: dono, próxima ação e prazo para todo o top 20 | 100% |
| F4-02 | Paper Clip operando ações permitidas (allowlist) com trilha em `ai_agent_runs` | ≥ 1 execução durável/semana |
| F4-03 | Intro agent: artefato aprovado por humano → envio | ≥ 1 intro enviada |
| F4-04 | Camada de contatos (gap duro vs. concorrentes): stakeholders do top 20 via enriquecimento | ≥ 2 contatos por conta do top 20 |
| F4-05 | Comparáveis reais de deals (tese de whitespace nº 3) para fit de produto explicável | Fit com comparável em 100% do top 20 |

### Horizonte (2027 T1)
Backtest/ground truth de sinais; arquivo frio Excel/Storage portado; observabilidade de quotas por conector; avaliação de saída do plano Free (quando métrica-norte > 60 ou compute > 70 h/mês).

---

## 5. Decisões pendentes do Marcelo

| ID | Decisão | Prazo | Recomendação |
| --- | --- | --- | --- |
| D-01 | Apagar as 6 branches `preview/*` e a `vercel-dev` no Neon | 10/10 | Sim — as branches de origem já foram mergeadas na `main` ou eram smokes `ops/*` |
| D-02 | Histórico Supabase: última tentativa ou abandono | 16/10 | Uma tentativa com prazo fixo; se falhar, seguir com dado novo — o volume de julho era majoritariamente de entidades sintéticas |
| D-03 | Fonte de headcount para o gate | 23/10 | Combinar (a) CVM Formulário de Referência para companhias abertas (gratuito, oficial) com (b) enriquecimento firmográfico via Apollo/Lusha para fechadas, gravando a fonte em `source_trace`; alternativa: `icp_headcount_override` manual só para o top da fila |
| D-04 | Religar workflows (F1) — autoriza Claude a habilitar via API, onda por onda | 13/10 | Sim, condicionado ao budget guard |
| D-05 | `AGENTETOME_API_KEY` | 16/10 | Cadastrar se o Agentetome segue no escopo; senão, desligar o job |
| D-06 | Política de previews Vercel↔Neon | 16/10 | Branch Neon só sob demanda |

---

## 6. Riscos

| Risco | Prob. | Impacto | Mitigação |
| --- | --- | --- | --- |
| Branch limit (10/10) quebra previews e migração em branch | Alta (já ocorrendo) | Médio | F0-03/F0-04 |
| Religar captura estoura compute do Free | Média | Alto | Ondas + budget guard (gatilhos 85 CU-h / 425 MB) |
| Gate de ICP continua bloqueando 100% | Alta sem F2-01 | Alto — métrica-norte fica em 0 | D-03 até 23/10 |
| Cron do GitHub não confiável para jobs de minutos | Alta (medido) | Médio | F1-04 |
| Produção divergir da `main` | Média | Médio | Deploy manual após cada merge relevante (F0-02) |
| Previews `CANCELED` mascaram falha real | Baixa | Baixo | Validação fica no CI + Neon Runtime Parity, não no preview |

---

## 7. O que aconteceu com os itens da V4.1

| Item V4.1 | Status em 09/10 | Destino |
| --- | --- | --- |
| P0-001 health com build metadata | Feito (`backend/src/lib/buildInfo.ts`) | Usado no critério de F0-02 |
| P0-002 verdade do runtime dos agentes | Feito (Paper Clip sem execução livre falsa) | — |
| P0-003 smoke autenticado CVM/Search | Aberto | F0-06 |
| P0-004 leaked password protection | **Obsoleto** (era do Supabase Auth) | — |
| P0-005 depreciação de URL do Node | Feito (verify-full SSL / limpeza de warnings, `88c4e5c`) | — |
| P1-001 runner agendado de Search Profile | Código feito; workflow desligado | F1-01/F1-05 |
| P1-002 health de discovery / capture inbox | Parcial | F1-06, F2-04 |
| P2-001 trigger engine real | Persistência feita; 0 eventos | F3-02 |
| P2-002 guardrails de score por evidência | Feito (gates de decisão) | — |
| P2-003 cobertura de tese | Aberto | F3-03 |
| P2-004 market map | Aberto | F3-03 |
| P3-001 higiene de SLA do pipeline | Aberto | F4-01 |
| P3-002 executor durável do Paper Clip | Feito (`ab06b4a`) | F4-02 (operação) |
| P3-003 command center | Parcial | F4-02 |
| P4-001 observabilidade e quotas | Parcial (budget guard) | F1-06 |
| P4-002 backfill histórico governado | Depende de D-02 | F0-07 |
| P4-003 motor de comparáveis | Aberto | F4-05 |
| P4-004 Copilot contextual | Aberto | F3-04 |

---

## 8. Regras que continuam valendo

- Toda entrega precisa aumentar a métrica-norte ou destravar uma etapa do funil.
- Uma PR por objetivo; produção só a partir da `main`, por deploy manual.
- “Real” exige execução, persistência, auditoria e smoke.
- Migração de schema só por `db/neon/*.sql` + Neon Runtime Parity; nada de DDL avulso.
- Fato verificado ao vivo ≠ suposição: este documento separa as duas coisas e deve ser revisado a cada marco (próxima revisão: **16/10**).
