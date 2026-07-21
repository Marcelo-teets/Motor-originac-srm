# Motor Originação — Backlog Atômico P0–P4

**Data:** 21/07/2026  
**Main:** `956382fa7b4f3cd679dcb29f8b7923652a9614f8`  
**Regra:** uma PR por objetivo; todo item precisa de teste, smoke e rollback.

| ID | Entrega | Owner | Arquivos/área | Aceite | Dependência | Rollback |
|---|---|---|---|---|---|---|
| P0-001 | Smoke do endpoint CVM health em produção | Warp | `api/capital-market-health.ts`; `CapitalMarketHealthPanel.tsx` | sem token=401; token inválido=401; sessão válida=200 | Nenhuma | rollback deployment |
| P0-002 | Confirmar SHA canônico da main | Warp | health canônico | SHA produção igual à main | P0-001 | promover deployment anterior |
| P0-003 | Versionar grants vivos das RPCs CVM | Codex | nova migration | anon/authenticated sem execute; service_role funcional | Nenhuma | migration reversa |
| P0-004 | Versionar policies de `ranking_v2` | Codex | nova migration | quatro policies reproduzidas e testadas | P0-003 | restaurar policies |
| P0-005 | Registrar leaked password protection | Warp | Supabase Auth/docs | status documentado sem secret | Nenhuma | n/a |
| P0-006 | Rebase técnico da PR #161 | Warp | branch `fix/capture-candidate-promotion-contract` | branch sobre main atual | P0-001 | abortar rebase |
| P0-007 | Revalidar migration 047 | Codex | `db/migrations/047*` | idempotente no schema vivo | P0-006 | não aplicar |
| P0-008 | Revalidar promoção CVM | Crédito+QA | Inbox/companies/links | uma promoção, UUID estável e lineage | P0-007 | remover fixture |
| P0-009 | Merge controlado da #161 | Warp | GitHub | CI/build/smoke verdes | P0-008 | revert squash |
| P0-010 | Fechar ou reescrever #154 | Orquestrador | GitHub | valor útil extraído em PRs menores | P0-009 | reabrir se necessário |
| P0-011 | Triar PRs #94–#119 | Orquestrador | GitHub | merge/recreate/superseded por PR | P0-010 | n/a |
| P0-012 | Atualizar issue #164 | Orquestrador | GitHub | evidências, SHAs e próximo gate | P0-009 | n/a |
| P1-001 | Rebase da PR #162 | Warp | branch `claude/expand-data-sources-p43120` | base main atual | P0-009 | abortar rebase |
| P1-002 | Auditar migrations 048–052 | Codex | migrations | sequência única; `metadata.code` sem duplicidade | P1-001 | não aplicar |
| P1-003 | Testar scrapers B2B | QA/Data | `originationScraperCapture.ts` | erro/vazio não gera sinal | P1-002 | feature flag off |
| P1-004 | Testar CVM FIDC public data | QA/Data | `fidcPublicDataCapture.ts` | hit real gera evidence; vazio silencia | P1-002 | feature flag off |
| P1-005 | Testar BCB SGS | QA/Data | `bcbSgs.ts`; `bcbSgsCapture.ts` | memoização e sinal fraco | P1-002 | feature flag off |
| P1-006 | Testar PNCP e Querido Diário | QA/Data | `publicRecordsCapture.ts` | somente hit concreto gera sinal | P1-002 | feature flag off |
| P1-007 | Testar portfólios VC | QA/Data | `vcPortfolios.ts`; `vcPortfolioDiscovery.ts` | anti-falso-positivo e dedupe | P1-002 | feature flag off |
| P1-008 | Testar Open Finance | QA/Data | participantes/capture | match CNPJ exato; sem substring | P1-002 | feature flag off |
| P1-009 | Merge da #162 | Warp | GitHub | 70+ testes, typecheck, build e smoke | P1-003..008 | revert squash |
| P1-010 | Aplicar migrations 048–052 | Warp | Supabase | advisors e counts esperados | P1-009 | rollback por migration |
| P1-011 | Criar scheduler de Search Profiles | Codex | runtime/workflow/cron | perfil ativo executa diariamente | P1-010 | desabilitar scheduler |
| P1-012 | Persistir `search_profile_runs` | Codex | storage/runtime | queued/running/completed/failed | P1-011 | desabilitar writes |
| P1-013 | Popular Capture Inbox | Data | candidates | 50+ candidatos com evidence | P1-012 | marcar batch de teste |
| P1-014 | Dedupe candidatos | Codex | runtime/storage/migration | CNPJ > domínio > nome; retry sem duplicar | P1-013 | versão anterior |
| P1-015 | Promover 20 empresas | Crédito/Originação | Capture Inbox UI | 20+ companies e links | P1-014 | reverter fixtures |
| P1-016 | Painel de discovery health | Codex | Search Profiles/API | runs, candidates, promotions e erros | P1-012 | ocultar painel |
| P2-001 | Definir catálogo de triggers | Crédito | constants/docs | tipo, força, confiança e materialidade | P1-015 | versionar catálogo |
| P2-002 | Persistir `trigger_events` | Codex | trigger engine/table | eventos >0 com dedupe/evidence | P2-001 | desabilitar writer |
| P2-003 | Recalcular qualification por trigger | Codex | operating system | trigger material cria snapshot | P2-002 | feature flag |
| P2-004 | Recalcular ranking por trigger | Codex | ranking | histórico temporal preservado | P2-003 | reverter versão |
| P2-005 | Thesis top 20 | Crédito+Codex | thesis service/store | why credit/now/estrutura/risco/ação/evidence | P2-004 | manter versão anterior |
| P2-006 | Market Map top 20 | Crédito+Codex | market map | estrutura, alternativas, tamanho e risco | P2-005 | versão anterior |
| P2-007 | Evidence panel na Company Detail | Frontend | `CompanyDetailPage.tsx` | evidência clicável por conclusão | P2-005 | reverter UI |
| P2-008 | Penalidade de staleness | Codex | scoring/ranking | dados antigos perdem peso | P2-004 | versionar fórmula |
| P2-009 | Proteção contra sinais duplicados | Codex | normalization/scoring | mesma evidência não multiplica score | P2-004 | feature flag |
| P2-010 | Revisão humana de thesis | Produto | Company Detail/API | aprovar, editar e versionar | P2-005 | read-only |
| P3-001 | Auditar top 20 no pipeline | Originação | pipeline | owner/estágio/ação/freshness | P2-006 | n/a |
| P3-002 | Preencher owners | Originação | pipeline | 100% top 20 | P3-001 | n/a |
| P3-003 | Preencher next actions | Originação | tasks/pipeline | 100% top 20 com prazo | P3-002 | n/a |
| P3-004 | SLA de tarefas | Codex | task service/dashboard | alerta de vencimento | P3-003 | desabilitar alertas |
| P3-005 | Schema de commands Paper Clip | Codex | nova migration | commands/runs/audit/idempotency | P0-003 | rollback migration |
| P3-006 | Worker Paper Clip | Codex | `abaService.ts` + worker | queued→running→completed/failed | P3-005 | feature flag |
| P3-007 | Allowlist de ações | Security/Product | Paper Clip | somente ações autorizadas | P3-006 | deny all |
| P3-008 | Gerar task idempotente | Codex | Paper Clip/tasks | retry não duplica | P3-006 | disable action |
| P3-009 | Gerar briefing pré-call | Codex+Crédito | Paper Clip/thesis | briefing com evidência interna | P3-006 | disable action |
| P3-010 | Audit trail Paper Clip | Codex | `ai_agent_runs` ou equivalente | actor/payload/output/error/timestamps | P3-006 | read-only |
| P3-011 | UI real de commands | Frontend | página dedicada/Settings | status verdadeiro e falhas visíveis | P3-010 | ocultar rota |
| P3-012 | Remover claim falso `real` | Frontend | `SettingsPage.tsx` | ABA partial até smoke | Nenhuma | restaurar após smoke |
| P3-013 | War room dashboard | Frontend/Product | Dashboard | top leads, no action, triggers e source health | P3-004 | reverter UI |
| P4-001 | Quotas de APIs | Data/Platform | usage tables | uso/limite/reserva | P1-010 | disable vendor |
| P4-002 | Backfill BCB SGS | Data | workflow/loader | séries persistidas | P4-001 | interromper workflow |
| P4-003 | Comparables engine | Crédito+Codex | backend | comparáveis citados e filtrados | P2-006 | feature flag |
| P4-004 | Vector context com Voyage | AI/Data | vector modules | contexto com lineage e quota | P4-001 | fallback local |
| P4-005 | Copilot contextual | AI/Product | Copilot UI/API | resposta com evidência interna | P4-004 | read-only/off |

## Sequência

1. P0 completo.
2. P1 completo.
3. P2 somente após 20 empresas promovidas.
4. P3 após thesis/market map dos top 20.
5. P4 após MVP funcional.

## Gates de corte

Não iniciar Trigger/Thesis/Market Map antes de 20 empresas promovidas com lineage.
Não chamar Paper Clip de real antes de task persistida, retry idempotente e audit trail.
