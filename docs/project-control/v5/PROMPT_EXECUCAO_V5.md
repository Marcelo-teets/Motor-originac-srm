# PROMPT — Execução do Planejamento V5 (Motor Originação SRM)

> Cole este documento inteiro no agente executor (Claude Code, Codex ou equivalente com acesso a GitHub, Neon e Vercel). **Execute**; não devolva só um plano. Passos que exigem dashboard autenticado estão marcados **[GPT/dashboard]** e devem virar handoff exato se você não tiver esse acesso.

---

## 0. Contexto obrigatório (leia antes de agir)

- Plano: `docs/project-control/v5/PLANEJAMENTO_V5_2026-10-09.md`
- Tracker: `docs/project-control/v5/ROADMAP_TRACKER_V5.yaml` — **atualize o `status` de cada item ao concluir** e registre o SHA/ID de evidência.
- Repo: `Marcelo-teets/Motor-originac-srm`, base `main`.
- Vercel: projeto `prj_hsB473e7bNF0xOd6CEUwo7WFgNYs`, team `team_PJwucES3YmFbxf57HE52Bw0v`, plano **Hobby** (cron só diário; máx. 12 funções por deploy). Produção **só** por `vercel-production-deploy.yml` (deploy manual).
- Neon: projeto `steep-poetry-38942951` (org `org-sweet-resonance-86348349`), branch `production` = `br-bold-pond-b6vde4xj`, plano Free (480 MB, 85 h ativas/mês, **10 branches**).
- Supabase `hdghpmssudrqhsbvrdyt`: legado, fora do runtime. **Não apagar.**

## 1. Regras inegociáveis

1. **Reconhecimento ao vivo antes de cada fase.** Não confie neste prompt nem em docs: confira Neon (`run_sql`), Vercel (`list_deployments`) e GitHub (`gh api`) e anote divergências no tracker.
2. **Uma PR por objetivo**, criada a partir da `main` atualizada. Nunca empurre direto na `main`.
3. Schema só via arquivo novo em `db/neon/AAAAMMDD_neon_<assunto>.sql` + workflow `Neon Runtime Parity` verde. **Nada de DDL avulso** via SQL console.
4. **Não invente SQL, tabela, coluna, função ou parâmetro.** Antes de escrever código contra uma função, leia a definição real: `select pg_get_functiondef('public.<nome>'::regproc);`. Antes de usar uma coluna, consulte `information_schema.columns`.
5. Nenhum segredo em código, log, PR, issue ou chat. Só **nomes** de variáveis.
6. **Ações destrutivas ou irreversíveis exigem a decisão correspondente marcada `approved` no tracker** (`decisions[].status`). Se estiver `open`, prepare tudo, descreva o comando exato e **pare** naquele item, seguindo para os itens independentes.
7. “Real” = execução + persistência + auditoria + smoke. Sem os quatro, o item não está concluído.
8. Antes de cada push: `npm run lint`, `npm run test:backend`, `npm run test:serverless` e os testes de contrato tocados (`node --test scripts/<arquivo>.test.mjs`). Push só com tudo verde.
9. Ao terminar cada fase, publique o relatório da §7 e **atualize a data-base e a fotografia** do plano (seção 2) com números reconsultados.

## 2. Linha de base a reconferir (09/10/2026)

Rode e compare; se divergir, o número novo vale:

```sql
select 'candidates' k, count(*)::text v from discovered_company_candidates
union all select 'promoted', count(*)::text from discovered_company_candidates where candidate_status='promoted'
union all select 'companies', count(*)::text from companies
union all select 'decision_eligible', count(*)::text from companies where public.is_company_decision_eligible(id)
union all select 'score_snapshots', count(*)::text from score_snapshots
union all select 'ranking_v2', count(*)::text from ranking_v2
union all select 'pipeline', count(*)::text from pipeline
union all select 'vector_documents_with_embedding', count(*)::text from vector_documents where embedding is not null
union all select 'user_profiles', count(*)::text from user_profiles
union all select 'neon_auth_users', count(*)::text from neon_auth."user"
union all select 'db_size', pg_size_pretty(pg_database_size(current_database()));
```

Esperado em 09/10: 46 / 2 / 2 / 0 / 0 / 0 / 0 / 0 / 0 / 1 / ~21 MB.
Workflows desligados: `gh api 'repos/Marcelo-teets/Motor-originac-srm/actions/workflows?per_page=100' --jq '.workflows[]|select(.state!="active")|.path'` → esperado 16.

---

## 3. Fase F0 — Higiene operacional (prazo 16/10)

### F0-01 · Mergear #550
- Confirme ao vivo: PR #550 `mergeable_state=clean`, checks `build-and-typecheck` e `parity` verdes no head atual.
- **Merge é decisão do Marcelo.** Se não tiver autorização explícita, deixe a PR pronta e registre no tracker `status: ready_for_merge`.
- Depois do merge, rode `gh workflow run capital-market-ingestion.yml -f dataset=debentures_snd` (o workflow está desabilitado: habilite-o só para esse disparo e volte a desabilitar se D-04 ainda estiver `open`) e verifique que o log **não** contém `Unsupported CVM dataset: debentures_snd`.

### F0-02 · Promover `main` à produção
- Pegue o SHA exato: `git ls-remote origin refs/heads/main`.
- Dispare: `gh workflow run vercel-production-deploy.yml -f sha=<SHA40> -f wait_for_ready=true`.
- Aceite: deploy `READY` com `target=production` e `githubCommitSha=<SHA40>` (`list_deployments`), e `production-auth-smoke.yml` verde com `expected_sha=<SHA40>`.

### F0-03 · Limpar branches Neon — **gate D-01**
- Liste: `list_branches` em `steep-poetry-38942951`.
- Candidatas (confirmar ao vivo): as 6 `preview/*` criadas pela Vercel em 08/10 e `vercel-dev` (arquivada).
- **Nunca** apague `production` nem `backup/production-20261008` (esta só depois de F1 concluída).
- Com D-01 `approved`: apague uma a uma e registre os IDs no tracker. Aceite: ≤ 3 branches.

### F0-04 · Política de previews Vercel↔Neon — **gate D-06** · [GPT/dashboard]
- Na integração Neon da Vercel (Settings → Integrations → Neon), desligar a criação automática de branch por deployment de preview, ou restringir a um ambiente explícito.
- Aceite: abrir uma PR de teste só com docs não cria nova branch no Neon (conferir `list_branches` antes/depois).

### F0-05 · Job horário do Agentetome — **gate D-05**
- Opção A (D-05 = manter): **[GPT/dashboard]** cadastrar `AGENTETOME_API_KEY` na Vercel (Production) e redeploy via F0-02.
- Opção B (D-05 = desligar): PR removendo a linha `- cron: '17 * * * *'` e o ramo `'17 * * * *') JOBS='agentetome' ;;` de `.github/workflows/neon-scheduled-jobs.yml`; manter o job acessível só por `workflow_dispatch`.
- Aceite: 24 h sem falha em `Neon Scheduled Jobs` (`gh api .../actions/workflows/neon-scheduled-jobs.yml/runs`).

### F0-06 · Perfil admin + smoke autenticado
Situação conhecida: `neon_auth."user"` tem **1** usuário, `user_profiles` = 0, `private.auth_bootstrap_claim` = 0. O bootstrap padrão (`docs/AUTH_USER_PROFILES_RUNBOOK.md` §6) **exige zero usuários**, então não se aplica como está.
1. Identifique o usuário existente: `select id, email, created_at from neon_auth."user";` — reporte só o e-mail ao Marcelo.
2. Se for o e-mail do Marcelo: PR com migração `db/neon/AAAAMMDD_neon_god_mode_profile_backfill.sql` que insere o perfil `god_mode` + `active` para **esse** `id` e grava a claim em `private.auth_bootstrap_claim`, usando exatamente as colunas reais das duas tabelas (consulte `information_schema` antes). Idempotente (`on conflict do nothing`).
3. Se não for: **pare** e peça decisão (apagar usuário residual e seguir o §6 do runbook com `MOTOR_AUTH_BOOTSTRAP_ENABLED=true` temporário).
4. Aceite: `production-auth-smoke.yml` verde; `MOTOR_AUTH_BOOTSTRAP_ENABLED` = `false` ao final.

### F0-07 · Histórico Supabase — **gate D-02**
- D-02 = tentar: seguir `migration/supabase-recovery/README.md`; precisa de `MOTOR_SUPABASE_DATABASE_URL` em segredo; executar `legacy-data-recovery.yml` (manual) contra uma **branch Neon** criada a partir de `production`, nunca direto em produção; parity + contagens antes de promover. Prazo fixo: 16/10.
- D-02 = abandonar: registrar no plano e seguir.

**Saída de F0:** produção = `main`; branches ≤ 7 (meta ≤ 3); `Neon Scheduled Jobs` verde por 24 h.

---

## 4. Fase F1 — Religar captura no Neon com orçamento (prazo 23/10) · **gate D-04**

Antes de cada onda: `gh workflow run neon-free-budget-guard.yml` e confirmar verde. Se o guard acusar ≥ 425 MB ou ≥ 85 h projetadas, **pare a onda**.

Para cada workflow da onda:
1. Leia o YAML e confirme que carrega o Neon via `scripts/load-neon-from-vercel.sh` (ou segredo `MOTOR_NEON_DATABASE_URL`) e **não** referencia Supabase. Se referenciar, corrija em PR antes de habilitar.
2. Habilite: `gh api -X PUT repos/Marcelo-teets/Motor-originac-srm/actions/workflows/<arquivo>/enable`.
3. Rode uma vez: `gh workflow run <arquivo>` (com os inputs default) e aguarde verde.
4. Confira crescimento real no Neon (contagem antes/depois da tabela-alvo).
5. Se falhar: desabilite de novo (`.../disable`), abra PR com a correção, repita.

| Onda | Workflows | Tabela-alvo para conferir |
| --- | --- | --- |
| A (F1-01) | `capture.yml`, `search-profile-discovery.yml`, `capital-market-ingestion.yml` | `monitoring_outputs`, `discovered_company_candidates`, `capital_market_events` |
| B (F1-02) | `cvm-fund-documents-schedule.yml`, `public-bulk-ingestion.yml`, `candidate-domain-intelligence.yml`, `candidate-cvm-registry-enrichment.yml` | As tabelas gravadas pelos CLIs `backend/src/cli/capitalMarkets.ts`, `publicBulkData.ts`, `candidateDomainIntelligence.ts`, `candidateCvmRegistry.ts` — confirmar no código antes |
| C (F1-03) | os 9 restantes, um por vez | — |

- Onda B só começa após 3 dias seguidos da onda A verdes. Onda C: para cada workflow, decidir **habilitar** (tem consumidor ativo no código) ou **aposentar** (PR apagando o YAML e citando o motivo). Nenhum pode ficar `disabled_manually` sem justificativa no tracker.

### F1-04 · Agendador confiável para jobs de minutos
- Fato: em 07–09/10 o GitHub disparou ~32 execuções de `neon-scheduled-jobs.yml` contra centenas previstas; Vercel Hobby não aceita cron sub-diário.
- Entregue em PR: (a) um único cron `*/15` que encadeia `reprocessing,entity-resolution,derived-materialization`; (b) remoção do `*/5`; (c) métrica de cobertura no relatório (execuções reais ÷ previstas em 48 h). Se a cobertura continuar < 90%, proponha alternativa (ex.: endpoint protegido por `CRON_SECRET` chamado por agendador externo) **sem implementar** antes da aprovação.

### F1-05 · Bootstrap dos Search Profiles
- Perfis ativos (09/10): `sp_fintech_credit_receivables`, `sp_middle_market_tech_dcm`, `sp_embedded_finance_pressure`, `sp_infra_tech_capital`.
- Rodar: `npx tsx backend/src/cli/searchProfileBootstrap.ts --profile-id <id>` para cada um (ou `--max-profiles 4`), com `MOTOR_NEON_DATABASE_URL` carregado do cofre.
- Revisar a fila: listar `discovered_company_candidates` com `candidate_status='captured'` ordenado por `confidence desc` e entregar ao Marcelo a lista para promoção humana (nome, CNPJ, fonte, evidência). **Não promover automaticamente.**

### F1-06 · Painel de frescor de dados
- PR adicionando ao `/sources` um bloco por fonte: último sucesso, última falha, itens/dia (7 dias), a partir de `source_connector_runs` e `source_health`. Respeitar o limite de 12 funções serverless (reutilizar rota existente).

**Saída de F1:** candidatos ≥ 300; promovidas ≥ 30; captura agendada verde 7 dias; métrica-norte ≥ 5.

---

## 5. Fase F2 — Universo real e elegibilidade (prazo 06/11)

- **F2-01 (gate D-03)** — Fonte de headcount. O gate já lê: `companies.metadata->>'icp_headcount_verified_min' | 'employee_count' | 'headcount'`, métricas com `metric_key in ('employee_count','employees','headcount','linkedin_employee_count','company_employee_count')` e `discovered_company_candidates.raw_payload#>>'{firmographic_evidence,headcountMin}'` (ver `db/neon/20261007_neon_origination_decision_gates.sql`, função `company_verified_headcount_floor`). **Não altere o gate**; escreva o dado no formato que ele já lê, com `source_trace` apontando a fonte. Implementar conforme a fonte aprovada em D-03. Para companhias abertas já existe o dataset `cvm_company_fre` em `capital-market-ingestion.yml` (Formulário de Referência da CVM, que traz número de empregados): verificar se a métrica de headcount é persistida e, se não for, gravá-la como `employee_count` com a fonte.
- **F2-02** — Cedentes FIDC: partir de `capital_market_entity_links` + informes mensais CVM; resolver CNPJ do cedente e promover como `companies` com `candidate_role` coerente. Meta ≥ 50.
- **F2-03** — Rodar `npx tsx backend/src/cli/materializeDerivedIntelligence.ts --limit=100` após F2-01/F2-02 e confirmar `consideredCompanies > 0`, `scoreSnapshotsWritten > 0`, `rankingRefreshed: true`.
- **F2-04** — Relatório semanal da fila de revisão humana (nada em `captured` há > 72 h).

**Saída:** métrica-norte ≥ 20.

## 6. Fases F3 e F4

Não iniciar antes da saída de F2. Seguir as tabelas das seções F3 e F4 do plano, com os mesmos gates. Pré-requisitos já conhecidos: `VOYAGE_API_KEY` (embeddings `voyage-3.5`, 1024 dimensões) e `AI_GATEWAY_API_KEY` (Copilot) na Vercel — **[GPT/dashboard]**.

---

## 7. Relatório ao fim de cada fase (formato fixo)

```
FASE: F<n> — <nome>
DATA: <dd/mm/aaaa hh:mm BRT>
ITENS: <id> → done | blocked (<decisão/motivo>) | ready_for_merge — evidência: <PR#/SHA/run id/query>
MÉTRICAS (reconsultadas): candidatos, promovidas, companies, elegíveis, score_snapshots, ranking_v2, branches Neon, horas ativas Neon no mês, tamanho do banco
DECISÕES PENDENTES: <D-xx: o que precisa, recomendação>
DIVERGÊNCIAS ENCONTRADAS vs. plano/prompt: <lista>
PRÓXIMO PASSO: <1 linha>
```

Atualize `ROADMAP_TRACKER_V5.yaml` (status, evidência, `snapshot_*` novo) na mesma PR do relatório ou numa PR de docs dedicada.
