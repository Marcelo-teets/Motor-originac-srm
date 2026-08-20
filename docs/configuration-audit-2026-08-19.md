# Auditoria de configuração — 2026-08-19

## Escopo e fonte de verdade

Esta auditoria segue a hierarquia operacional do projeto: cérebro mestre → `main` do GitHub → Supabase vivo → Vercel vivo → documentação derivada.

Ambiente canônico:

- GitHub: `Marcelo-teets/Motor-originac-srm`
- Supabase: `hdghpmssudrqhsbvrdyt`
- Vercel: `motor-originac-srm` / `prj_hsB473e7bNF0xOd6CEUwo7WFgNYs`
- Produção: `https://motor-originac-srm.vercel.app`
- Google Sheet de controle: `1qSMfIrpAbOmBE9x26WhyGk4Cn4AOLk7lAMKfbd1Msag`
- Google Drive archive root: `16RwLyzLUm45BshgO5Qkr9kZunYBfDuNV`
- Catálogo de arquivo histórico: `1z29lCdGlZdndvurzZP7LqGPOreyIm5onlnmFvUquY3Y`

Nenhum valor secreto foi copiado para este documento.

## 1. Inventário de variáveis e secrets

| Grupo | Variável | Uso | Superfície esperada | Status em 2026-08-19 |
|---|---|---|---|---|
| Supabase | `SUPABASE_URL` | REST/Auth/DB | GitHub Actions + Vercel/backend | **Validada**: jobs chegam ao Supabase e Auth aponta para o projeto canônico |
| Supabase | `SUPABASE_ANON_KEY` | Auth público / REST limitado | Vercel/backend + alguns Actions | **Validada no frontend**; Actions específicos devem manter o secret |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | persistência privilegiada | GitHub Actions + Vercel/backend | **Validada**: etapas de credenciais passam; falhas atuais são timeout do banco |
| Supabase | `SUPABASE_PROJECT_REF` | automação/config Auth | CI/operator | **Canônico**: `hdghpmssudrqhsbvrdyt` |
| Supabase | `USE_SUPABASE` | seleciona persistência real | Vercel/backend | **Esperado `true`** em produção; health está real |
| Supabase | `BOOTSTRAP_SUPABASE` | bootstrap local/runtime | backend | **Documentada**; não é requisito para serverless consolidado |
| Worker | `CRON_SECRET` | autentica cron/workers | GitHub Actions + Vercel | **Validada**: Search Profile, Knowledge e health chegam aos endpoints protegidos |
| Vercel | `VERCEL_TOKEN` | deploy controlado | GitHub Actions | **Validada**: secret está presente; rollout falhava depois do gate de credencial |
| Vercel | `VERCEL_ORG_ID` | escopo do projeto | CI/operator | **Canônico**: `team_PJwucES3YmFbxf57HE52Bw0v` |
| Vercel | `VERCEL_PROJECT_ID` | projeto de produção | CI/operator | **Canônico**: `prj_hsB473e7bNF0xOd6CEUwo7WFgNYs` |
| Vercel | `VERCEL_OIDC_TOKEN` | credencial efêmera AI Gateway | fornecida pela Vercel | **Gerenciada pela plataforma**; não deve ser secret estático público |
| Google | `GOOGLE_DRIVE_CLIENT_ID` | OAuth Drive/Sheets | GitHub Actions | **Não enumerável pelo connector**; historicamente ausente em 10/08; Sheet foi atualizado em 19/08, mas cold archive ainda não materializou pastas de datasets |
| Google | `GOOGLE_DRIVE_CLIENT_SECRET` | OAuth Drive/Sheets | GitHub Actions | **Mesmo status do Client ID** |
| Google | `GOOGLE_DRIVE_REFRESH_TOKEN` | OAuth sem interação | GitHub Actions | **Mesmo status do Client ID** |
| Google | `GOOGLE_DRIVE_ARCHIVE_FOLDER_ID` | raiz cold archive | workflow/script | **Validada**: pasta existe e é acessível |
| Google | `GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID` | manifesto cold archive | workflow/script | **Validada**: planilha existe e é acessível |
| Storage | `SUPABASE_DB_TARGET_MB` | limite operacional | scripts/backend | **Documentada**: 400 MB |
| Storage | `SUPABASE_DB_WARNING_MB` | alerta | scripts/backend | **Documentada**: 425 MB |
| Storage | `SUPABASE_DB_CRITICAL_MB` | bloqueio/cap | scripts/backend | **Documentada**: 450 MB |
| Storage | `SUPABASE_DB_EMERGENCY_MB` | emergência | scripts/backend | **Documentada**: 475 MB |
| AI | `AI_GATEWAY_API_KEY` | AI Gateway opcional | Vercel/backend | **Opcional** quando OIDC está disponível; billing externo continua bloqueador conhecido |
| AI | `KNOWLEDGE_LEARNING_MODEL` | modelo learning agent | backend | **Documentada**: `openai/gpt-5.4` |
| AI tasks | `OPENAI_API_KEY` | geração de tarefas | Vercel/backend | **Consumida pelo código; presença live não enumerável pelo connector** |
| AI tasks | `OPENAI_TASK_MODEL` | modelo OpenAI | Vercel/backend | default `gpt-5-mini` |
| AI tasks | `ANTHROPIC_API_KEY` | fallback/Claude | Vercel/backend | **Consumida pelo código; presença live não enumerável pelo connector** |
| AI tasks | `ANTHROPIC_TASK_MODEL` | modelo Anthropic | Vercel/backend | default `claude-sonnet-4-20250514` |
| Mais Retorno | `MAIS_RETORNO_API_KEY` | API externa | server-side | **Não validada diretamente nesta auditoria** |
| Mais Retorno | `MAIS_RETORNO_API_BASE_URL` | host | backend | default `https://developers.maisretorno.com` |
| Mais Retorno | `MAIS_RETORNO_API_PATH` | path MCP | backend | default `mcp` |
| Mais Retorno | `MAIS_RETORNO_MONTHLY_QUOTA` | governança | backend | default 500 |
| Mais Retorno | `MAIS_RETORNO_MONTHLY_TARGET` | governança | backend | default 500 |
| Agentetome | `AGENTETOME_API_KEY` | provider/MCP | server-side / vault | **Não exposta**; runtime atual usa também RPC/Vault |
| Agentetome | `AGENTETOME_API_BASE_URL` | host | backend | default `https://www.agentetome.com` |
| Agentetome | `AGENTETOME_MCP_URL` | endpoint MCP | backend | default `https://www.agentetome.com/api/mcp` |
| Microsoft | `MICROSOFT_CLIENT_ID` | OAuth | Vercel/backend | **Consumida pelo código; presença live não enumerável** |
| Microsoft | `MICROSOFT_CLIENT_SECRET` | OAuth | Vercel/backend | **Consumida pelo código; presença live não enumerável** |
| Microsoft | `MICROSOFT_TENANT_ID` | tenant | Vercel/backend | default `common` |
| Microsoft | `MICROSOFT_REDIRECT_URI` | callback OAuth | Vercel/backend | deve ser `https://motor-originac-srm.vercel.app/api/integrations/microsoft/callback` |
| Microsoft | `MICROSOFT_PLANNER_GROUP_ID` | Planner | Vercel/backend | **Opcional até conectar/preparar Planner; presença live não enumerável** |
| Microsoft | `MICROSOFT_TOKEN_ENCRYPTION_KEY` | AES-256-GCM | Vercel/backend | **Obrigatória quando integração está ativa; não enumerável** |
| Microsoft | `MICROSOFT_STATE_SECRET` | OAuth state | Vercel/backend | **Obrigatória quando integração está ativa; não enumerável** |
| Microsoft | `MICROSOFT_SCOPES` | Graph permissions | Vercel/backend | default documentado no `.env.example` |
| Runtime | `APP_BASE_URL` | URL canônica | Vercel/backend | deve ser `https://motor-originac-srm.vercel.app` |
| Frontend | `VITE_API_BASE_URL` | dev local | frontend | prod usa same-domain consolidado; valor live não é crítico |
| Frontend | `VITE_SUPABASE_URL` | Auth público | Vercel/frontend | **Validada** contra o projeto canônico |
| Frontend | `VITE_SUPABASE_PUBLISHABLE_KEY` | Auth público moderno | Vercel/frontend | **Validada** contra chave publicável ativa |
| Frontend | `VITE_SUPABASE_ANON_KEY` | fallback legado | Vercel/frontend | suportada por compatibilidade |

### Correções aplicadas nesta PR

1. `.env.example` passou a documentar todas as famílias atualmente consumidas pelo código: Vercel ops, Microsoft, Task AI e chave publicável moderna do Supabase.
2. `Vercel Health Smoke` passou a testar o domínio canônico `motor-originac-srm.vercel.app` em vez do alias antigo de projeto.
3. O rollout Agentetome passou a validar `scoreImpact` de acordo com o tipo real de follow-up. O follow-up `entity-relevance-gate-v3-production-rollout` pode ter `scoreImpact=true`; o workflow não deve mais rejeitar um marker correto por uma premissa legada.

## 2. Schedulers / crons

### Vercel

| Endpoint | Cron UTC | Papel | Status |
|---|---:|---|---|
| `/api/data-capture/cron/run` | `30 10 * * *` | captura diária | **Ativo; revisar sobreposição com Actions** |
| `/api/strategic-public-data-run` | `15 9 * * 1` | dados estratégicos | **Ativo** |
| `/api/sources/qsa-fallback-run` | `30 10 8 * *` | fallback QSA | **Ativo** |
| `/api/integrations/microsoft/cron-sync` | `15 12 * * *` | To Do/Planner | **Configurado; integração depende dos `MICROSOFT_*`** |

### GitHub Actions

| Workflow | Cron UTC | Secrets principais | Status |
|---|---:|---|---|
| Capture | `0 2,8,14,20 * * *`; `15 9 * * *`; `30 10 * * 1`; `45 11 1 * *` | Supabase URL/service | **Executa; sofre timeout do Supabase** |
| Capital Market Ingestion | `20 9 * * *`; `0 14 * * *`; `40 10 * * 1` | Supabase URL/service + CRON | **Configurado** |
| Search Profile Discovery | `30 8 * * *` | CRON + Supabase | **Credenciais OK; sofre timeout do Supabase** |
| Candidate Domain Intelligence | `0 9 * * *` | Supabase URL/service | **Credenciais OK; sofre timeout do Supabase** |
| Knowledge Learning Agent | `17 * * * *` | CRON | **Endpoint acessível; sofre indisponibilidade Supabase/AI provider** |
| Knowledge Embedding Coverage | `15 10 * * *` | CRON | **Configurado** |
| Source Control Sheet Sync | `17 * * * *` | Supabase + Google OAuth | **Configurado; confirmar secrets Google atuais por execução** |
| Google Drive Cold Archive | `37 * * * *` | Supabase + Google OAuth | **Código preparado; sem evidência de migração efetiva na raiz Drive** |
| Vercel Health Smoke | `20 11 * * *` | CRON | **URL corrigida nesta PR** |
| Source Activation Probes | `0 12 * * 2` | Supabase URL/service | **Configurado** |
| Source Schedule Coverage Audit | `20 12 * * 2` | Supabase URL/service | **Configurado** |
| Tech Signals People & Capital | `25 12 * * *` | Supabase URL/service/anon | **Configurado** |
| Public Bulk Data | `35 10 * * *`; `20 11 * * 0`; `50 11 5 * *` | Supabase URL/service | **Configurado** |
| CVM Fund Documents | `5 10 * * *`; `35 10 * * 1`; `55 10 * * 1` | Supabase URL/service | **Configurado com storage budget guard** |
| Candidate CVM Registry | `30 14 * * 1-5` | Supabase URL/service | **Configurado** |
| Strategic Public Data | `40 09 8 * *` | Supabase URL/service | **Configurado** |
| Finep Official Data | `10 13 * * 2` | Supabase URL/service | **Configurado** |
| BNDES Automatic Datastore | `40 12 * * 0` | Supabase URL/service | **Configurado** |
| Auth Production Bootstrap | `5 17 25 7 *` | Vercel token | **One-shot histórico; hoje inerte salvo dispatch manual** |

### Supabase `pg_cron` observado em produção

Os logs vivos confirmaram, entre outros:

- `process_origination_reprocessing_queue(25)` — aproximadamente a cada 5 minutos;
- `auto_resolve_verified_candidate_entities_v4(50)` — aproximadamente a cada 15 minutos;
- `private.reconcile_historical_excel_archives()`;
- `private.queue_due_historical_excel_archives()`;
- `private.run_agentetome_due_exports()`.

**Estado:** os crons existem, mas vários registram `job startup timeout` ou `statement timeout`. O problema atual é capacidade/concor­rência, não ausência de credencial.

## 3. Dados e armazenamento

| Camada | Papel | Status |
|---|---|---|
| Supabase Postgres | Company Master, monitoring, signals, qualification, patterns, score, ranking, pipeline, control plane | **Canônico e saudável no control plane, porém saturado na camada SQL** |
| Supabase Storage | staging de arquivos históricos | **Usado como hot/staging; migração cold precisa destravar** |
| Google Drive archive root | cold storage gratuito | **Existe e está acessível; não há pastas de datasets materializadas na raiz na inspeção de 19/08** |
| Google Sheet histórico | manifesto dos arquivos migrados | **Existe e está acessível** |
| Google Sheet `Fonte de dados - dcm` | controle oficial das fontes/status | **Existe; atualização de 19/08, porém resumo ainda apresenta inconsistências agregadas** |
| GitHub | código, migrations, workflows, documentação | **Fonte oficial do código** |
| Vercel | runtime/deploy/logs | **Produção HTTP 200, mas deployment observado está atrás da `main`** |

## 4. Problemas encontrados por prioridade

### P0 — Supabase saturado

Sintomas confirmados:

- `statement timeout` em consultas e jobs;
- `job startup timeout` em múltiplos `pg_cron`;
- Advisors de segurança e performance também expiram;
- Vercel registra timeouts de 30 s em `/api/index` e capturas de 24 s excedendo orçamento serverless;
- Actions que validam secrets corretamente falham depois, durante SQL.

Ação correta: reduzir concorrência, otimizar consultas pesadas e escalonar os jobs. **Não** aumentar timeout como primeira resposta e **não** apagar dados sem uma política de archive validada.

### P0 — Cold archive Google ainda não comprovado

Em 10/08 os três secrets OAuth do Google estavam comprovadamente ausentes no workflow antigo. Em 19/08 o Sheet de controle foi atualizado, mas a raiz do cold archive ainda não mostra datasets migrados. A presença atual dos valores de secrets não é enumerável pelo connector.

Ação: confirmar uma execução real do `Google Drive Cold Archive` com `configured=true`, migrar uma pequena amostra verificada e somente depois expandir. Manter `DELETE_STAGING=false` até validar hash/manifesto/patch de Supabase ponta a ponta.

### P1 — Produção atrás da main

Produção responde `200`, mas o SHA observado do deployment está atrás da `main`. O deploy é propositalmente controlado, então não é um erro de Git integration; é um rollout pendente.

### P1 — Agentetome rollout com falso bloqueio

O marker atual declara follow-up de entity relevance e `scoreImpact=true`, mas o workflow exigia `scoreImpact=false` sem considerar o tipo de follow-up. Corrigido nesta PR sem adulterar o marker.

### P1 — Scheduler sobreposto

Há captura no Vercel, múltiplos workflows no GitHub e jobs internos no `pg_cron`. A combinação é consistente com a pressão observada. Antes de desligar qualquer rotina, consolidar uma matriz `fonte → scheduler oficial → fallback` e remover duplicidades somente com evidência.

### P2 — Secrets que o conector não consegue enumerar

Vercel e GitHub não expõem valores de secrets ao connector. Para Microsoft, OpenAI/Anthropic, Mais Retorno e Google OAuth, quando não há execução recente que prove o secret, o status deve permanecer `não validado`, nunca ser tratado como presente por suposição.

## 5. Critérios de aceite para fechar a auditoria operacional

- [ ] CI desta PR verde.
- [ ] PR mergeada na `main`.
- [ ] Deployment canônico promovido e SHA de produção igual à `main` aprovada.
- [ ] `Vercel Health Smoke` verde no domínio canônico.
- [ ] Um ciclo `Source Control Sheet Sync` confirma Google OAuth atual.
- [ ] Um ciclo `Google Drive Cold Archive` migra pelo menos 1 parte com hash, manifesto e patch validados.
- [ ] Supabase volta a responder Advisors e consultas administrativas simples sem timeout.
- [ ] Matriz de schedulers é consolidada, com um scheduler primário por responsabilidade e fallback explícito.
- [ ] `Fonte de dados - dcm` permanece versionada em `Página1!C1` após alterações.
