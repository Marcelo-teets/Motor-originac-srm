# Motor Originação SRM — Planejamento V5

**Data-base:** 09/10/2026 13:36 BRT (reconciliada ao vivo; plano original 11:00 BRT)
**Substitui:** `docs/project-control/v4/` (V4.1, 21/07/2026) e `STATUS_E_ROADMAP_2026-07-17.md` — ambos escritos sobre o Supabase, hoje fora do runtime.
**Tracker máquina-legível:** `ROADMAP_TRACKER_V5.yaml` (nesta pasta).

**Pacote V5 (nesta pasta):**

| Arquivo | Para quê |
| --- | --- |
| `PLANEJAMENTO_V5_2026-10-09.md` | Este plano: diagnóstico, metas, fases, decisões e riscos. |
| `ROADMAP_TRACKER_V5.yaml` | Status item a item, com evidência (PR, SHA, run). |
| `PROMPT_EXECUCAO_V5.md` | Prompt para o agente executor. |
| `RUNBOOKS_OPERACAO_V5.md` | RB-01 deploy · RB-02 ondas de captura · RB-03 bootstrap do admin · RB-04 branches Neon · RB-05 agendador · RB-06 rotina semanal. |
| `RUNBOOK_INCIDENTE_STORAGE_2026-10-09.md` | Incidente 434/457 MB: linha do tempo, SQL verbatim da limpeza e religação. |
| `KPIS_V5.sql` | 11 consultas validadas no Neon: métrica-norte, funil, SLA, headcount, captura, frescor, discovery, gatilhos, RAG, orçamento. |
| `HANDOFFS_V5.md` | Papéis por agente e prompts prontos (GPT/dashboard, Codex, Claude). |

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

## 5. Decisões (tomadas em 09/10/2026, por delegação do Marcelo)

Em 09/10 às 13:58 o Marcelo delegou as decisões pendentes. Registro, motivo e execução:

| ID | Decisão | Motivo | Execução em 09/10 |
| --- | --- | --- | --- |
| D-01 | **Aprovado.** Apagar `vercel-dev` e as `preview/*` de PRs já fechadas. `production` e `backup/production-20261008` ficam. | Origem já mergeada ou smoke `ops/*` | As 6 `preview/*` de 08/10 já tinham sido removidas pela integração Vercel↔Neon ao fechar as PRs; `vercel-dev` (`br-little-cherry-b6z5lec2`) apagada. **Branches: 10 → 4** (`production`, `backup/production-20261008` e 2 previews de PRs abertas). |
| D-02 | **Encerrar a recuperação ativa do histórico Supabase.** Projeto `hdghpmssudrqhsbvrdyt` fica intacto como arquivo passivo (não apagar, não pagar). Reabrir só se ficar acessível sem custo. | O histórico de julho tinha 1 empresa real; sinais eram de seeds sintéticos. Recuperar exige upgrade/suporte e não move a métrica-norte. | F0-07 → `closed_no_recovery`. |
| D-03 | **Headcount em duas camadas, nesta ordem:** (1) companhias abertas → `cvm_company_fre` (Formulário de Referência CVM, já existe no `capital-market-ingestion.yml`); (2) fechadas promovidas → enriquecimento firmográfico (Apollo `organizations_enrich`), só para empresas já promovidas, gravando a fonte em `source_trace`. `icp_headcount_override` manual apenas para o top 10 da fila, com justificativa. | Fonte oficial e gratuita primeiro; custo de enriquecimento limitado ao que já passou pela revisão humana. | Camada 1 implementada na **#569**. Camada 2 (Apollo) só depois de medir a cobertura da camada 1. |
| D-04 | **Aprovado religar por ondas**, com budget guard verde antes de cada onda. | Captura é o gargalo nº 1. | Guard verde (run 37963191485: storage 8,7%, compute 16,9%, branches 4). **Onda A habilitada e disparada:** `capture.yml`, `search-profile-discovery.yml`, `capital-market-ingestion.yml`. Falhas encontradas viraram PRs #564 e #565 (ver §5.1). |
| D-05 | **Desligar o cron horário do Agentetome** até existir `AGENTETOME_API_KEY`; job continua por `workflow_dispatch`. | Falhava em toda execução; ninguém fornece a chave hoje. | PR #563. |
| D-06 | **Manter a criação automática de branch por preview, com limpeza ativa.** Previews de PRs já fechadas são apagadas sob D-01 sempre que o total passar de 7. | As 6 de 08/10 sumiram sozinhas, mas as das PRs #563/#564/#565 continuaram após o merge (a limpeza da integração não é imediata). Mudar a integração exige dashboard e não resolve a causa. | F0-04 → `closed_no_change`; reavaliar se o guard acusar ≥ 8 branches de novo. |
| D-07 | **Aprovado remover o usuário residual de smoke**, mas **somente na janela de bootstrap com o Marcelo presente**: (1) apagar `motor-auth-smoke-…@example.com`; (2) `MOTOR_AUTH_BOOTSTRAP_ENABLED=true`; (3) Marcelo se cadastra e vira `god_mode`; (4) variável volta a `false`; (5) `production-auth-smoke.yml` verde. | Abrir o bootstrap sem o Marcelo presente deixaria o `god_mode` disponível para o primeiro cadastro. | Aguardando janela com o Marcelo. |

### 5.1 Execução complementar em 09/10

- **F0-02 concluído:** `main@776be89` promovida à produção pelo `vercel-production-deploy.yml` (run 37963933776) → deployment `dpl_PsFPVfdC5ZwsHoK48tFEzq4SrAvY` READY; `production-auth-smoke.yml` verde (run 37964112272).
- **Onda A — achados:**
  - `search-profile-discovery.yml`: `run_discovery` verde; `classify_news_candidates` falhou com `Unsafe SQL identifier: raw_payload->>transportSourceRef` → **PR #564** (filtro por texto JSON no adaptador Postgres).
  - `capture.yml`: ~20 fontes por empresa capturadas; falha só em *Company Careers Pages* (`Invalid URL`, empresas sem website) → **PR #565** (vira observação parcial).
  - `capital-market-ingestion.yml` (`dataset=all`, run 37963355986): **incidente de storage**. A trava pré-execução limita 20 mil linhas *por dataset*, não por execução; 7 datasets gravaram ~124 mil linhas (`capital_market_events`, `bronze_historical_records`, `capital_market_metrics`, `capital_market_entity_links`) e o banco foi de **21 MB para 434 MB**, contra o limite de 457 MB do projeto. O job abortou com `project size limit (457 MB) has been exceeded`. Os três workflows da onda A foram **desabilitados de novo**. Limpeza proposta (aguarda aprovação do Marcelo): manter só `cvm_fidc_monthly`, apagar as linhas de 09/10 dos outros 6 datasets e rodar `VACUUM FULL`; depois, trava por execução antes de religar.
- **Merges (14:33):** #563 (`12ec4cf`), #564 (`ba1a539`), #565 (`4422eaa`).
- **Redeploy de `4422eaa` falhou** (run 37967451209): o próprio `vercel-production-deploy.yml` desconecta o Git do projeto ao fim de cada deploy, e o deploy seguinte quebra ao tentar atualizar variáveis de preview presas a branch. Correção: **PR #566**.
- **Branches Neon:** voltaram a 10/10 com as previews das PRs #563/#564/#565; as 3 foram apagadas após o merge → **7**.
- **Ainda abertas:** #550 (SND), #566 (deploy), #556 (este plano). A #559 foi incorporada nesta PR e pode ser fechada.

### 5.2 Entregas de código de 09/10 (tarde)

| Item | PR | O que resolve | Estado |
| --- | --- | --- | --- |
| Incidente / F1 | **#568** | Teto de linhas **por execução** e pela folga real de storage na ingestão de mercado de capitais (causa raiz do 434/457 MB). Agenda semanal começa por FRE e FIDC. | CI pendente/verde; mergear **antes** de religar `capital-market-ingestion` |
| F2-01 (D-03) | **#569** | Headcount oficial da CVM (FRE 10.1A, colunas `Quantidade_*` conferidas no dicionário da CVM) → `employee_count` observado em `company_source_metric_snapshots`, que o gate de ICP lê. Função `sync_cvm_fre_headcount_metrics()` validada no Neon em transação revertida. | Aguarda merge + migração |
| F1-04 | **#570** | Um único cron `*/15` encadeando reprocessamento → resolução → materialização. | Aguarda merge |
| F2-02 | **#571** | Os nove maiores cedentes de cada FIDC (Tab I, `TAB_I2A12/I2B12_CPF_CNPJ_CEDENTE_1..9`) viram vínculos `assignor`. Antes: 15.652 eventos FIDC e **0** vínculos. CPFs ignorados. | Aguarda merge |
| F0-02 | — | Produção = `main@14e25de` (run 37971618529), depois que a #567 corrigiu o sync de Auth com o Git desconectado. | ✅ |
| F0-03 | — | Branches Neon voltaram a 10/10 (previews de PRs já mergeadas); apagadas as de #537, #544, #563, #564, #565. | Rotina RB-04 |

**Achados que mudam o plano:**
- O agendador entregou só **26 execuções em 48 h** (10 com sucesso), contra mais de 700 previstas. É isso que a #570 ataca; se a cobertura continuar abaixo de 90%, decidir por agendador externo.
- O deploy oficial força `MOTOR_AUTH_BOOTSTRAP_ENABLED=false`. A janela D-07 precisa de Redeploy pelo dashboard (RB-03).
- As colunas brutas não ficam no bronze (`compact_manifest`): toda extração nova (headcount, cedentes) só aparece na **próxima** ingestão. Depois da limpeza, ingerir `cvm_company_fre` e `cvm_fidc_monthly` um por vez (H-06).

### 5.3 Sequência crítica até a métrica-norte sair do zero

1. Marcelo aprova a limpeza ("opção 1") → Claude executa o runbook do incidente.
2. Merge de #568, #569, #570 e #571 → migração do FRE pelo fluxo de parity → RB-01.
3. RB-02 onda A (`capture`, `search-profile-discovery`) → `capital-market-ingestion` só com `cvm_company_fre`, depois `cvm_fidc_monthly`.
4. Materialização (RB-05) → KPI bloco 1. **Expectativa:** companhias abertas promovidas com headcount ≥ 50 passam no gate de ICP; cedentes de FIDC entram como candidatos para revisão humana.

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
