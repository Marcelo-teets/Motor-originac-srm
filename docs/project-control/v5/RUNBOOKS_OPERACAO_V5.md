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

**Regras de eficiência:** a onda B só começa depois de 3 dias verdes da onda A. Nenhum workflow fica `disabled_manually` sem justificativa registrada no tracker. A execução manual coleta **um dataset por vez**, com limite de linhas **por execução** (default 1.000); agenda semanal executa **FRE (segunda 10:40 UTC) e FIDC Tab I (segunda 11:40 UTC) em runs separados de 1.000 linhas**; não compartilhar um orçamento que pode ser esgotado pelo primeiro dataset. Um push de código só faz testes: ingestão de produção por push exige alteração explícita de `backend/src/services/.cvm-trigger`. Não usar títulos de issue/PR como gatilho de ingestão. Após cada run, exigir contagens before/after, registros elegíveis, bytes/registro e crescimento de `pg_database_size` menor que a folga sinalizada pelo guard.

---

## RB-03 · Recuperação segura do administrador e verificação de e-mail (D-07)

**Estado confirmado em 23/10/2026 (SELECT read-only):** existem 2 identidades
Neon Auth, 1 perfil `god_mode + active`, 1 claim de bootstrap e **zero**
identidades com `emailVerified=true`. Portanto, **o administrador já tem perfil,
mas não consegue passar o gate de e-mail verificado**. Não é um projeto vazio.

**Procedimento prioritário, sem alterar contas nem reabrir bootstrap:**

1. Na tela oficial `https://motor-originac-srm.vercel.app/login`,
   o **titular da conta administrativa existente** informa seu próprio e-mail,
   seleciona **Enviar código para verificar meu e-mail** e consulta sua caixa de
   entrada. Nunca enviar senha, OTP, token ou link de sessão ao GitHub/chat.
2. O titular digita o código na tela **Confirmar e-mail**. A verificação
   ocorre exclusivamente pelo proxy first-party para o Neon Managed Auth.
   Depois entra normalmente com e-mail e senha; nenhuma execução automática
   aprova `user_profiles`, crédito ou acessos de outra pessoa.
3. Conferir sem expor e-mails ou IDs:
   ```sql
   select count(*) as verified_active_admins
   from public.user_profiles p join neon_auth."user" a on a.id=p.id
   where p.role='god_mode' and p.status='active'
     and a."emailVerified"=true and coalesce(a.banned,false)=false
     and lower(btrim(p.email))=lower(btrim(a.email));

   select count(*) as bootstrap_claims from private.auth_bootstrap_claim;
   ```
   Esperado: `verified_active_admins=1` e `bootstrap_claims=1`.
   Executar o smoke oficial `production-auth-smoke.yml` depois da
   confirmação. D-07 somente passa quando o avaliador V5 apontar o vínculo
   Auth institucional **verificado**, não apenas `user_profiles.active`.
4. Se o código não chegar ou o Neon rejeitar verificação, revisar o
   provedor de e-mail/OTP autorizado, logs de erro e limites no Neon; **não**
   marcar `emailVerified` por SQL, não forjar sessão/JWT, não trocar o
   administrador e não apagar o usuário histórico como tentativa de correção.
   Registrar o bloqueio e solicitar intervenção do titular/provedor.

**Bootstrap inicial é recurso excepcional, não reparo de e-mail.** O procedimento
histórico que excluía um usuário de smoke e religava
`MOTOR_AUTH_BOOTSTRAP_ENABLED=true` **não se aplica quando já existem
identidades e claim**. Qualquer recuperação destrutiva/irreversível exige
backup verificado, inventário das identidades, revisão de risco, autorização
específica e janela assistida. Nunca ativar bootstrap público desassistido.
O workflow oficial deve manter `MOTOR_AUTH_BOOTSTRAP_ENABLED=false`.

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

**Atualização de guard:** o workflow `capital-market-ingestion.yml` pode atualizar o cache via `scripts/check-neon-storage-budget.mjs --requested-rows=0 --trigger=manual` ao receber um push no arquivo de workflow; essa etapa não executa ingestão de dados. O refresh também ocorre normalmente no preflight de cada coleta. Verificar sempre a leitura persistida e a correspondência de bytes antes de habilitar captura.

**Baseline verificada após limpeza:** banco ~73 MiB; `capital_market_events` ~33 MiB / 15.752 linhas; `bronze_historical_records` ~17 MiB / 15.751 linhas; `capital_market_metrics` 339; `capital_market_entity_links` 55. A mesma fonte pode ocupar bronze e evento: não duplicar payloads adicionais sem medição e contrato de linhagem.

1. **Guard:** no workflow oficial (com `MOTOR_NEON_DATABASE_URL` da Vercel), rodar `node scripts/check-neon-storage-budget.mjs --requested-rows=100 --trigger=manual`. Conferir saída `state=healthy`; depois SELECT em `private.database_growth_guard_state`. Proibido sobrescrever `status`/`current_bytes` diretamente.
2. **Custos por fonte:** medir `pg_database_size(current_database())` antes/depois, `recordsInserted` versus `recordsUnchanged`, e `entityLinksWritten`/`metricsWritten`. Se ingestão gera bronze mas zero links, métricas ou candidatos, priorizar o arquivo correto antes de aumentar volume.
3. **FIDC:** usar exclusivamente a Tab I do informe mensal (campos `TAB_I2A12_CPF_CNPJ_CEDENTE_*` e `TAB_I2B12_CPF_CNPJ_CEDENTE_*`) para a tese de cedentes; preservar fund identity e ignorar CPFs. Falta de Tab I deve falhar explicitamente, não gravar Tab III como aparente sucesso.
4. **FRE:** priorizar arquivo de empregados (10.1A), contar `capital_market_metrics.employee_count`, sincronizar `company_source_metric_snapshots` e confirmar elegibilidade do gate. Sem headcount verificado, não prometer score.
5. **Índices:** antes de adicionar índice, comparar `pg_indexes` e `pg_stat_user_indexes`. Há duas definições idênticas `(dataset_code, ref_date DESC)` no bronze (índices `bronze_historical_records_dataset_ref_idx` e `idx_bronze_historical_dataset_ref`), candidatas a deduplicação em **PR de migração própria**, com medição de espaço e planos EXPLAIN. **Não remover automaticamente**; migrations via `db/neon/*.sql` + plano oficial + parity.
6. **Proteção:** não executar `DELETE` nem `VACUUM FULL` periodicamente. A limpeza do incidente 09/10 foi extraordinária, com autorização específica. Não excluir backup ou dados FIDC para acomodar uma nova coleta genérica.
7. **SLO:** budget guard verde antes de cada onda, 3 dias sem erro na A antes da B, refresh físico do guard e revisão do uso de índices/storage semanalmente.

---

## RB-08 · Cedentes FIDC: identidade antes da promoção (13/10/2026)

**Smoke real auditado:** GitHub Actions `38403931727`, 100 linhas FRE + 100 linhas FIDC Tab I, ambos `completed`; 100 métricas `employee_count` (FRE), 91 vínculos de cedentes e **85 CNPJs distintos**, todos com checksum válido, do informe CVM de setembro/2026. Banco físico ~79 MB. Ainda não há `company_source_metric_snapshots.employee_count` nem novos registros `companies`; essa ausência é esperada enquanto identidade e vínculos não coincidirem.

**Procedimento canônico — sem duplicar bronze:**

1. Consulte `public.fidc_assignor_identity_queue_v5` (view `security_invoker`, sem exposição a `anonymous`/`authenticated`). Cada linha é um **CNPJ válido e sua linhagem CVM**, com quantidade de fundos, data e arquivo de origem.
2. Classifique `identity_next_step`: `needs_registry_identity` requer consulta first-party para razão social; `candidate_identity_review` requer verificar identidade já capturada; `linked_company` segue para qualification. **CNPJ válido ≠ empresa qualificada**.
3. Enriquecer primeiro com registro público e nome legal sustentado por fonte. Verificar se pertence a companhia operacional, fintech, cedente ou intermediário financeiro. Separar fundos, gestoras e instituições não ICP. Não atribuir `company_name` fictício.
4. Somente criar/promover candidato pelo fluxo oficial de revisão de identidade com evidência e critério comercial (recebíveis estruturáveis, ticket, funding gap, capacidade creditícia, headcount). Não inventar dados de crédito nem criar `score_snapshots` sem ICP.
5. Medir conversão: `CNPJs válidos → nomes verificados → candidatos revisados → companies → elegíveis → qualification/patterns/score/ranking`. Reportar rejeições e duplicatas com justificativa.
6. A view é derivada de `capital_market_entity_links` e `capital_market_events`, não materializa cópia e evita duplicação de custos. Versionar qualquer mudança em `db/neon` + migration plan + parity.

**Gate da Onda A:** não habilitar captura genérica para contornar a falta de empresas. Rodar apenas fontes direcionadas com budget guard verde e observar valor comercial gerado por MB.


---

## RB-09 · Identidade registral incremental de cedentes FIDC (M1, 13/10/2026)

**Pré-condições:** `fidc_assignor_identity_queue_v5` já tem CNPJs válidos com fonte CVM Tab I; `database_growth_guard_state=normal`; conexão Neon via cofre Vercel no GitHub Actions. Não usar `dataset=all`.

- Schema incremental: `fidc_assignor_registry_identities`, chave primária `cnpj`, mínimo de colunas necessárias, nenhum dump da resposta completa. A view `fidc_assignor_identity_queue_v5` ganha os campos `registry_legal_name`, `registry_status`, `registry_url`, `registry_checked_at`, `registry_review_stage`. Sem materializar eventos CVM novamente.
- Consulta: `backend/src/cli/fidcAssignorRegistry.ts --limit 10` via `npm exec -- tsx`, com limite rígido de 20 por rodada, timeout/retry do connector compartilhado e intervalo entre requisições; cache de 30 dias por CNPJ e idempotência na UPSERT.
- Origem: `brasilapi_receita_proxy` é um intermediário cadastral. Em 13/10, o runner GitHub obteve **HTTP 403** na BrasilAPI e **HTTP 200** no endpoint público Minha Receita para o mesmo CNPJ, conforme GitHub Actions #38421339302. O serviço consulta `minhareceita_receita_proxy` apenas se a BrasilAPI estiver indisponível. Os dois são proxies de dados RFB, não certidões oficiais nem evidência de capacidade de crédito. Cada registro guarda a URL real e o provedor efetivo; só aceitar retorno com CNPJ idêntico e checksum válido, além de razão social não vazia.
- Revisão obrigatória: `registry_identity_review_required` **não promove** `discovered_company_candidates` ou `companies`. Revisar entidade operacional, recebíveis, funding gap, headcount e IC P antes de promover por workflow de identidade existente.
- Falha: `status=partial` ou CNPJ divergente não grava nome. Operação manual por lote e auditoria antes/depois; sem relançar automaticamente uma coleta massiva. Rerun só quando budget permitir.
- Métrica M1: `select count(*) from fidc_assignor_identity_queue_v5 where registry_legal_name is not null;`. Meta inicial >=50 verificados por registro, **ainda sujeitos a revisão comercial**. Confirmar nenhum acesso anônimo/autenticado direto à view.

**Deploy:** migration em `db/neon` + plano/allowlist, PR → CI + parity → merge → PR de solicitação do deploy oficial → ledger Neon + Auth/health smoke → canário com lotes pequenos e relatório de integridade.


### Provedor público terciário CNPJ.ws (13/10/2026)

Quando BrasilAPI e Minha Receita retornarem `partial`, a resolução cadastral pode tentar **CNPJ.ws API Pública**, sem token, em `https://publica.cnpj.ws/cnpj/{cnpj}`. É um intermediário de dados públicos, não a Receita Federal diretamente. Contrato oficial: [API Pública](https://docs.cnpj.ws/referencia-de-api/api-publica/consultando-cnpj), limite **3 chamadas por minuto por IP** ([limitações](https://docs.cnpj.ws/en/referencia-de-api/api-publica/limitacoes)); aplicar intervalo mínimo de 21 segundos entre chamadas desse provedor na execução. Resposta é aceita somente com **`estabelecimento.cnpj` completo e igual ao CNPJ CVM**, checksum válido e `razao_social` não vazia; o campo `cnpj_raiz` isolado **nunca** comprova o estabelecimento. Persistir apenas as colunas mínimas do cache, `registry_provider=cnpjws_publica_proxy` e URL exata, sem sócios/endereços brutos. Não aumentar consultas se canário de 1 CNPJ falhar, e jamais auto-promover empresa, score ou lead.

---

## RB-10 · Revisão comercial dos cedentes FIDC (14/10/2026, M2/A2)

**Baseline real (Neon produção):** 85 CNPJs com fonte CVM Tab I; 51 razões sociais corroboradas com proveniência (44 situações ativas, 7 inaptas), 2 empresas cadastradas, 0 qualificação/score/ranking. A identidade cadastral já superou a meta M1 de 50, **mas M2 permanece aberto**. Muitos cedentes são indústrias, fabricantes e intermediários financeiros fora do ICP tech.

**Consulta segura:** `select cnpj, legal_name, registration_status, review_lane, recommended_review_action, registry_url, cvm_evidence_url, distinct_funds, establishments_in_cvm_queue from public.fidc_assignor_commercial_review_v5 order by review_lane, distinct_funds desc, evidence_links desc limit 100;`. View `security_invoker`, acesso restrito ao papel operacional; não há materialização ou duplicação de payload CVM.

**Revisão humana obrigatória, sem inferir teses a partir do nome:**

1. `registry_lookup_pending`: falta identidade corroborada. Nunca promover.
2. `registration_exception_review`: verificar situação (inapta, baixada, suspensa, nula) e se há divergência/falência antes de prosseguir.
3. `regulated_entity_review`: **sinal textual somente**, não exclusão definitiva. Confirmar se é banco, securitizadora, gestora, administrador, distribuidora ou outra entidade fora do ICP.
4. `business_model_due_diligence`: validar site, modelo de negócio tech, headcount/porte, recebíveis estruturáveis, concentração, carteira/lastro, necessidade de funding, FIDC existente, timing e ticket. Não marcar `credit_product` ou `fit_fidc` sem evidência.
5. `cnpj_root` agrupa estabelecimentos da mesma raiz; verificar duplicatas econômicas antes de contar cinco empresas diferentes.

**Aceite M2:** shortlist de empresas operacionais com fontes, conclusão de revisão por pessoa autorizada, razão de no-go ou de elegibilidade, eventual criação/promoção **pelo fluxo canônico de aprovação individual**. `icp_eligibility_status='unverified'`, `receivables_structurability_status='unknown'` e `funding_gap_status='unknown'` permanecem constantes na view para impedir pontuação indevida.

**Não promover ou qualificar automaticamente os 51 registros somente por terem CNPJ válido.** O próximo KPI é o número de empresas realmente aderentes, não o número de cadastros resolvidos.
