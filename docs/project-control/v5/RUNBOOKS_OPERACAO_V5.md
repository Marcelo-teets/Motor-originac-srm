# Runbooks de operação — Planejamento V5

Comandos conferidos em 09/10/2026. Todos os `gh` usam a API REST, porque GraphQL não está disponível nas sessões de agente. `R=repos/Marcelo-teets/motor-originac-srm`.

---

## RB-01 · Deploy de produção (F0-02)

**Quando:** depois de cada merge relevante na `main`. O deploy é manual, porque a Vercel está desconectada do Git de propósito.

1. Pegue o SHA exato da `main` e confira o CI:
   ```bash
   SHA=$(git ls-remote origin refs/heads/main | cut -f1)
   gh api $R/commits/$SHA/check-runs --jq '.check_runs[] | select(.name=="build-and-typecheck") | .conclusion'   # precisa ser success
   ```
2. Dispare o deploy:
   ```bash
   gh api -X POST $R/actions/workflows/vercel-production-deploy.yml/dispatches \
     -f ref=main -f "inputs[sha]=$SHA" -F 'inputs[wait_for_ready]=true'
   ```
3. Acompanhe:
   ```bash
   gh api "$R/actions/workflows/vercel-production-deploy.yml/runs?per_page=1" --jq '.workflow_runs[0] | "\(.id) \(.status) \(.conclusion) \(.head_sha)"'
   ```
4. **Aceite:** run `success` e deployment de produção `READY` com `githubCommitSha = $SHA` (Vercel MCP `list_deployments`, `target=production`). O próprio workflow roda o smoke de saúde e o de Auth.
5. **Rollback:** promover o deployment anterior marcado `isRollbackCandidate: true` (Vercel → Deployments → Promote), ou disparar o passo 2 com o SHA anterior.

Histórico: `776be89` (37963933776) ✅; `4422eaa` (37967451209) ❌ corrigido pela #567; `14e25de` (37971618529) ✅; `c0d828b` (38143356320, 11/10) ✅, READY, Neon Auth e paridade aprovados. O fluxo também aceita o gatilho de release exclusivamente em `.github/deploy-requests/motor-production.txt`, aprovado por PR e merge na main. **Não usar deploy direto Vercel.**

---

## RB-02 · Religar captura por ondas (F1-01..F1-03, decisão D-04)

**Pré-requisitos (11/10):** limpeza aprovada concluída (434 → 73 MiB), PR #568 e deploy V5 presentes, **mas** `database_growth_guard_state` permaneceu `block_raw` com bytes antigos. O workflow de budget executa `private.refresh_database_growth_guard()`; **não religar captura até esse fluxo comprovar `state=healthy`, `blocked=false`, guard persistido `normal` e folga física coerente.**

**Para cada workflow:**
1. Guard:
   ```bash
   gh api -X POST $R/actions/workflows/neon-free-budget-guard.yml/dispatches -f ref=main
   ```
   Pare se `allowed=false`, storage ≥ 425 MB ou compute projetado ≥ 85 h.
2. Contagem "antes" da tabela-alvo (`KPIS_V5.sql`, blocos 2 e 5).
3. Habilitar:
   ```bash
   gh api -X PUT $R/actions/workflows/<arquivo>/enable
   ```
4. Uma execução manual:
   ```bash
   gh api -X POST $R/actions/workflows/<arquivo>/dispatches -f ref=main [-f 'inputs[...]=...']
   ```
5. Run verde **e** contagem "depois" maior que "antes".
6. Se falhar: `gh api -X PUT $R/actions/workflows/<arquivo>/disable`, abrir PR com a correção e repetir.

| Onda | Workflow | Inputs do dispatch | Tabela-alvo |
| --- | --- | --- | --- |
| A | `capture.yml` | `inputs[cadence]=all` | `monitoring_outputs`, `company_signals` |
| A | `search-profile-discovery.yml` | — | `discovered_company_candidates`, `search_profile_runs` |
| A | `capital-market-ingestion.yml` | `inputs[dataset]=cvm_company_fre`, depois `cvm_fidc_monthly`, com `inputs[max_rows]=100` no primeiro smoke. **Nunca `all`.** | `capital_market_metrics.employee_count` → `company_source_metric_snapshots`; FIDC Tab I → `capital_market_entity_links.assignor` |
| B | `cvm-fund-documents-schedule.yml`, `public-bulk-ingestion.yml`, `candidate-domain-intelligence.yml`, `candidate-cvm-registry-enrichment.yml` | defaults | conferir no CLI de cada um |
| C | os 9 restantes, um por vez | defaults | habilitar se houver consumidor; senão PR apagando o YAML |

**Regras de eficiência:** a onda B só começa depois de 3 dias verdes da onda A. Nenhum workflow fica `disabled_manually` sem justificativa registrada no tracker. A execução manual coleta **um dataset por vez**, com limite de linhas **por execução** (default 1.000); agenda semanal prioriza só FRE e FIDC. Um push de código só faz testes: ingestão de produção por push exige alteração explícita de `backend/src/services/.cvm-trigger`. Não usar títulos de issue/PR como gatilho de ingestão. Após cada run, exigir contagens before/after, registros elegíveis, bytes/registro e crescimento de `pg_database_size` menor que a folga sinalizada pelo guard.

---

## RB-03 · Janela de bootstrap do admin (F0-06, decisão D-07)

**Pré-condição:** Marcelo disponível por ~15 minutos, com o e-mail que vai usar no Motor.

1. Confirmar o usuário residual (o e-mail esperado é `motor-auth-smoke-…@example.com`):
   ```sql
   select id, email, "createdAt" from neon_auth."user";
   select count(*) from public.user_profiles;
   select count(*) from private.auth_bootstrap_claim;
   ```
2. Apagar o usuário de smoke (Neon MCP `delete_auth_user` com o `id` acima). Conferir que `neon_auth."user"` ficou com 0.
3. Ligar o bootstrap: na Vercel (Production), `MOTOR_AUTH_BOOTSTRAP_ENABLED=true`, depois **Redeploy pelo dashboard da Vercel** no deployment de produção atual. **Não** use o RB-01 aqui: o passo de sync de Auth do `vercel-production-deploy.yml` força `MOTOR_AUTH_BOOTSTRAP_ENABLED=false` a cada deploy (`scripts/sync-public-auth-env-to-vercel.mjs`).
4. **Marcelo** se cadastra em `https://motor-originac-srm.vercel.app` e faz o primeiro login.
5. Conferir:
   ```sql
   select role, status from public.user_profiles;   -- esperado: god_mode, active
   select count(*) from private.auth_bootstrap_claim; -- esperado: 1
   ```
6. **Imediatamente:** rodar o RB-01. O deploy oficial volta `MOTOR_AUTH_BOOTSTRAP_ENABLED` para `false` e publica de novo. Conferir na Vercel que a variável ficou `false`.
7. Rodar `production-auth-smoke.yml` e confirmar verde.

**Nunca** deixar o bootstrap ligado sem o Marcelo na tela: o primeiro cadastro vira `god_mode`.

---

## RB-04 · Higiene de branches Neon (decisão D-01/D-06)

**Gatilho:** `list_branches` com mais de 7 branches, ou criação de branch falhando com `branches limit exceeded`.

1. Listar as branches `preview/*` e, para cada uma, achar a PR da branch Git de origem:
   ```bash
   gh api "$R/pulls?state=all&head=Marcelo-teets:<branch>" --jq '.[] | "#\(.number) \(.state) merged=\(.merged_at != null)"'
   ```
2. Apagar apenas previews de PRs **fechadas** ou de branches `ops/*` sem PR com mais de 24 h (Neon MCP `delete_branch`).
3. **Nunca** apagar `production` nem `backup/*`.
4. Registrar os IDs apagados no tracker (F0-03).

---

## RB-05 · Agendador (F1-04)

- Depois da #570: um único cron `*/15` roda `reprocessing → entity-resolution → derived-materialization`.
- **Cobertura** (meta ≥ 90% em 48 h, ou seja, ≥ 173 de 192). Linha de base antes da #570, medida em 09/10 18:40 UTC: **26 execuções agendadas em 48 h, 10 com sucesso**, contra mais de 700 previstas pelos crons `*/5`, `*/15` e horário.
  ```bash
  gh api "$R/actions/workflows/neon-scheduled-jobs.yml/runs?per_page=100&event=schedule" \
    --jq '[.workflow_runs[] | select(.created_at > (now - 172800 | todate))] | {total: length, ok: map(select(.conclusion=="success")) | length}'
  ```
- Execução manual de qualquer job:
  ```bash
  gh api -X POST $R/actions/workflows/neon-scheduled-jobs.yml/dispatches -f ref=main -f 'inputs[jobs]=reprocessing,entity-resolution,derived-materialization'
  ```
- O Agentetome só roda por dispatch (`inputs[jobs]=agentetome`), até existir `AGENTETOME_API_KEY`.

---

## RB-06 · Rotina semanal (sexta, antes da revisão do plano)

1. Rodar `KPIS_V5.sql`, blocos 1, 2, 3, 4, 5, 8, 9 e 10.
2. Atualizar o `snapshot_*` no `ROADMAP_TRACKER_V5.yaml` e a seção 2 do plano.
3. Conferir: workflows desabilitados, branches Neon (RB-04), produção = `main` (RB-01).
4. Publicar o relatório no formato da §7 do `PROMPT_EXECUCAO_V5.md`.

---

## RB-07 · Eficiência de storage e qualidade da ingestão (11/10/2026)

**Baseline verificada após limpeza:** banco ~73 MiB; `capital_market_events` ~33 MiB / 15.752 linhas; `bronze_historical_records` ~17 MiB / 15.751 linhas; `capital_market_metrics` 339; `capital_market_entity_links` 55. A mesma fonte pode ocupar bronze e evento: não duplicar payloads adicionais sem medição e contrato de linhagem.

1. **Guard:** no workflow oficial (com `MOTOR_NEON_DATABASE_URL` da Vercel), rodar `node scripts/check-neon-storage-budget.mjs --requested-rows=100 --trigger=manual`. Conferir saída `state=healthy`; depois SELECT em `private.database_growth_guard_state`. Proibido sobrescrever `status`/`current_bytes` diretamente.
2. **Custos por fonte:** medir `pg_database_size(current_database())` antes/depois, `recordsInserted` versus `recordsUnchanged`, e `entityLinksWritten`/`metricsWritten`. Se ingestão gera bronze mas zero links, métricas ou candidatos, priorizar o arquivo correto antes de aumentar volume.
3. **FIDC:** usar exclusivamente a Tab I do informe mensal (campos `TAB_I2A12_CPF_CNPJ_CEDENTE_*` e `TAB_I2B12_CPF_CNPJ_CEDENTE_*`) para a tese de cedentes; preservar fund identity e ignorar CPFs. Falta de Tab I deve falhar explicitamente, não gravar Tab III como aparente sucesso.
4. **FRE:** priorizar arquivo de empregados (10.1A), contar `capital_market_metrics.employee_count`, sincronizar `company_source_metric_snapshots` e confirmar elegibilidade do gate. Sem headcount verificado, não prometer score.
5. **Índices:** antes de adicionar índice, comparar `pg_indexes` e `pg_stat_user_indexes`. Há duas definições idênticas `(dataset_code, ref_date DESC)` no bronze (índices `bronze_historical_records_dataset_ref_idx` e `idx_bronze_historical_dataset_ref`), candidatas a deduplicação em **PR de migração própria**, com medição de espaço e planos EXPLAIN. **Não remover automaticamente**; migrations via `db/neon/*.sql` + plano oficial + parity.
6. **Proteção:** não executar `DELETE` nem `VACUUM FULL` periodicamente. A limpeza do incidente 09/10 foi extraordinária, com autorização específica. Não excluir backup ou dados FIDC para acomodar uma nova coleta genérica.
7. **SLO:** budget guard verde antes de cada onda, 3 dias sem erro na A antes da B, refresh físico do guard e revisão do uso de índices/storage semanalmente.
