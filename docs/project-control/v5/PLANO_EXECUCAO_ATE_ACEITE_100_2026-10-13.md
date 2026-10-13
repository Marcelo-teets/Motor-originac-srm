# Motor Originação — plano de execução até aceite de 100% do MVP

**Versão:** 13/10/2026 · **base de código:** `de969c69c02ad222e9909ad4be0cd946edfb40fe` · **ambiente:** Neon production + Vercel via GitHub Actions.
**Cérebro institucional:** `origination_project_brain_master.txt`; `PLANO_ATIVACAO_FUNCIONAL_2026-10-13.md` permanece como plano de referência. Este arquivo detalha a **execução e os critérios de aceite**.

## Definição de 100% funcional — não confundir com build/deploy verde

**MVP operacional aprovado** exige simultaneamente:
- Auth administrativo real e RLS testados por pessoa autorizada; o bootstrap D-07 exige a presença do usuário. Login fictício não conta.
- Originação com fontes públicas Brasil-only, CNPJ verificado, fonte e data; 5 ou mais **empresas operacionais, verificadas e aderentes ao ICP**, com recebíveis/produto de crédito, potencial FIDC/DCM, headcount/porte e hipótese de funding explicados — sem inventar fatos.
- Cinco empresas com `qualification_snapshots`, `company_patterns` quando aplicável, `score_snapshots`, `lead_score_snapshots`, `ranking_v2`, tese e próxima ação. **Revisão humana antes de promoção**.
- Dashboard, Leads, Company Detail, Search Profiles e Pipeline exibindo esses dados reais, com owner, estágio de funil, evidência e ação; nenhum mock silencioso.
- Conectores/monitoramento com fontes, freshness, erros, dedupe, histórico e storage guard, comprovados por **7 dias corridos de runs saudáveis** (não antecipar a passagem do tempo).
- Runbook de on-call, rollback, evidência do SHA idêntico em GitHub/Vercel, parity Neon, Auth smoke, segurança de permissão e aceite comercial documentado.

**Full produto/roadmap institucional** (RAG, Copilot, predição, todos conectores, Paperclip etc.) fica separado: não declarar 100% da visão de longo prazo apenas por atingir o MVP.

## Baseline auditada de 13/10/2026

| Controle | Resultado inicial |
| --- | --- |
| GitHub main | `de969c6`; Vercel última READY `c6d8476` (sem paridade de SHA ainda) |
| Neon | guard `normal`, bytes registrados/físicos `79.085.568`; 6 branches, backup preservado |
| Cedentes CVM FIDC | 85 CNPJs checksum válidos; 91 vínculos com fonte Tab I |
| Razões sociais no cache | 20; 18 situação cadastral contendo `ATIV` |
| Company Master / candidatos | 2 / 50 |
| Qualificação / scores / rankings / usuários reais | 0 / 0 / 0 / 0 |
| Auth humano e 7 dias verdes | pendentes; não substituíveis por código |

## Sequência executável e gates de liberação

| Ordem | Entrega/PR | Dependência | Teste de aceite (evidência necessária) | Status inicial |
| --- | --- | --- | --- | --- |
| A0 | Sincronizar roadmap e observabilidade | latest main | tracker sem dados antigos tratados como atuais, baseline registrada | em execução |
| A1 | Enriquecer CNPJs restantes em lotes de até 20 | guard normal, provedor com checksum exato | ≥50/85 nomes corroborados, 0 promoções por lote, fonte/provedor/status e orçamento registrados | 20/85 |
| A2 | Triar entidades e verificar nomes/atividade econômica | A1 | revisar CNPJ, nome, CNAE/atividade, segmento tech, porte/funcionários, tipo de entidade, fundos/intermediários/no-go; gerar shortlist com motivos e fontes | não iniciado |
| A3 | Resolver/confirmar promoção individual via serviço canônico | A2 + RLS | ≥5 `companies` válidas e com ICP demonstrado, source_trace, dedupe, rollback lógico/auditoria, nenhuma promoção em massa | não iniciado |
| A4 | Enriquecer fontes para headcount e funding | A3 | snapshots `employee_count` por match exato, recebíveis, estrutura existente e funding gap com fonte ou `unknown` | não iniciado |
| A5 | Executar qualification → patterns → scores → thesis → ranking | A4 | ≥5 empresas com scores versionados e rationale; tese FIDC/DCM e próxima ação, métricas SQL verificadas | não iniciado |
| A6 | Completar Auth D-07 + jornada na UI | participação do usuário + A5 | login/logout, RLS, screens protegidas, CRUD pipeline real, sem fallback mock oculto | bloqueio humano |
| A7 | Operação recorrente Wave A e B | guard normal + A1/A5 | 3 dias A verde antes de B; **7 dias reais** sem violação storage, logs, DLQ, dedupe, escalonamento | tempo real pendente |
| A8 | Release final + aceite comercial | A1–A7 | main=Vercel READY SHA, migrações/parity/Neon guard/Auth smoke, 5 teses prontas e aceite assinado | não iniciado |

## Regras de execução e deploy para cada PR

1. Atualizar base na `main` real e criar uma PR pequena por objetivo. Validar tipos, `npm test` backend, teste de conector/contract, migrations e segurança (RLS/grants).
2. Se alterar Neon: migrar **somente** em `db/neon/*.sql`, registrar em `scripts/lib/neon-migration-plan.mjs`, allowlist e contrato de runtime; passar Neon Runtime Parity em preview; proibir SQL avulso em produção.
3. Merge apenas depois de checks verdes e diff revisado. Não usar rebase forçado nem branches paralelas indefinidas.
4. Para liberar produção: PR que altera `.github/deploy-requests/motor-production.txt`, CI verde e merge; workflow oficial `.github/workflows/vercel-production-deploy.yml` executa secrets Neon/Vercel, migrations, parity, storage guard, build, deploy prebuilt, runtime/Auth smoke.
5. Aceite do release exige `main SHA == deployment READY SHA` e verificações SELECT no Neon em tabelas de negócio. Nunca declarar implantação por mero merge.
6. Depois de falha, manter captura parada e corrigir via PR; rollback só com runbook e sem perda de evidência. `backup/production-20261008` e `production` são intocáveis por limpeza comum.

## Fluxo comercial e perfil de tese

Conectar `Search Profiles → Sources → Monitoring Outputs → Signals → Enrichment → Qualification → Patterns → Score/Lead Score → Thesis → Ranking → Pipeline`.
Qualificação requer: crédito é core? recebíveis estruturáveis? FIDC existente? dívida estruturada? estrutura de capital e funding gap? escala/ticket? timing? sinais de headcount/risco/CM? Padrões de capital mismatch, growth without funding, expansion outpacing capital e embedded finance pressure. Score separado em necessidade estrutural, timing, executabilidade e confiança da fonte. Não penalizar automaticamente dados ausentes como falsos. Indicador final: **operações abordáveis**, não número de CNPJs coletados.

## Controles de acompanhamento

Em cada PR/run, registrar: número, SHA, migrations, CI, data, estado de produção, métricas antes/depois, erro/risco e gate satisfeito. A tabela de execução em `ROADMAP_TRACKER_V5.yaml` deve referenciar este plano e jamais confundir metas com fatos.

**O que a engenharia pode entregar sem a presença do usuário:** A0/A1, instrumentação de A2–A5, runbooks, testes e PRs. **O que não pode atestar sozinha:** Auth administrativo de usuário humano, revisão comercial final e o intervalo de 7 dias de monitoramento saudável.
