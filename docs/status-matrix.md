# Matriz de status funcional

> Fonte operacional de verdade para leitura rápida. Diferencie sempre **código validado**, **schema aplicado** e **produção promovida**. Nenhum item deve ser marcado como real em produção apenas porque existe na branch.

| Área | Status | Observação |
| --- | --- | --- |
| Auth | Real / degradado pelo data plane | `/auth/login`, `/auth/logout` e `/auth/me` usam Supabase Auth real com JWT validado no backend. Enquanto o data plane do projeto canônico estiver indisponível, fluxos dependentes do Supabase podem falhar; não há fallback de credenciais. |
| Search Profiles | Real/Parcial | Lista e persistência usam `search_profiles` + `search_profile_filters`. A PR #468 alinha descoberta à semantics v4 + recency; promoção final depende das migrations e do smoke real após recuperação do Supabase. |
| Companies | Real / indisponível durante outage | Lista, detalhe, qualification, patterns, thesis, market map e ranking usam Supabase como fonte primária. Produção não deve substituir indisponibilidade por dados sintéticos. |
| Dashboard | Real / indisponível durante outage | KPI strip, top leads e sumários dependem de snapshots persistidos. Durante indisponibilidade do Supabase, o estado correto é erro/parcial explícito, nunca preenchimento fictício. |
| Monitoring | Real/Parcial | BrasilAPI, RSS públicos e website monitoring produzem outputs/sinais reais. O circuit breaker da main contém execuções automáticas enquanto o Supabase está degradado para evitar amplificar Disk IO. |
| Sources | Real / indisponível durante outage | `source_catalog` é lido do backend com status por fonte. A captura automática permanece contida até a recuperação confiável do banco. |
| Agents | Código validado / ativação pendente | Qualification, patterns e lead score estão implementados. A PR #468 adiciona Paperclip real/auditável; sua ativação em produção depende da migration `paperclip_real_control_plane` e do smoke pós-recuperação. |
| Database | BLOQUEADO EXTERNO | Projeto `hdghpmssudrqhsbvrdyt` aparece `ACTIVE_HEALTHY` no control plane, mas SQL/MCP segue em timeout e PostgREST/backup apresenta 521/522. Nano IO Guard está versionado na main; migrations funcionais da PR #468 não devem ser aplicadas nem a PR mergeada até o data plane responder de forma confiável. |
| Frontend fallback | Sem fallback sintético no fechamento MVP | A PR #468 remove o fallback sintético de Quick Actions. Estados `partial`/`mock` permanecem identificados como não aptos a decisão; ausência de dado real não é preenchida com leads, ações ou contatos inventados. |
| Supabase request policy | Corrigido na PR #468 | Em Vercel, chamadas Supabase falham explicitamente em até 5s/1 tentativa para ficar abaixo do orçamento serverless; workers fora da Vercel mantêm retry robusto. `select`, `upsert`, `insert`, `update`, `delete` e `rpc` usam a política governada. |
| Vercel produção | Estável no shell / API degradada pelo Supabase | Frontend e `/api/health` respondem. Endpoints dependentes do banco podem falhar enquanto o Supabase estiver indisponível. Produção ainda está em SHA anterior ao fechamento da PR #468 e só deve ser promovida após migrations + smoke. |
| ABM War Room | Real/Parcial | Camada comercial operacional com stakeholders, touchpoints, objeções, momentum/priority e briefing; evolução de governança/completude segue parcial. |
| Connector Observability | Real/Parcial | `GET /sources/usage/mais-retorno` expõe quota governada com status derivado do modo (`supabase` → real, `memory` → partial); persistência real depende do Supabase disponível. |
| Capture Diagnostics | Real | `/api/data-capture/health` exige `Bearer CRON_SECRET`; disponibilidade pública mínima permanece em `/api/health`. O health de tabelas usa timeout limitado e retorna degradação explícita. |

## Regra de promoção do fechamento MVP

A PR #468 só pode ser promovida quando todos os itens abaixo forem verdadeiros, nesta ordem:

1. SQL no Supabase responde de forma confiável;
2. migrations atuais são listadas e reconciliadas;
3. Supabase Nano IO Guard da main é aplicado/validado antes de novas mudanças, se ainda ausente no banco;
4. migrations `close_dcm_outreach_loop`, `paperclip_real_control_plane` e `people_capital_runtime_schedule` são aplicadas somente se ausentes;
5. RLS, grants, RPCs, cron schedules e advisors são validados;
6. smoke real executa capture → qualification → patterns → score → lead score → ranking → outreach, exigindo `autoSend=false`;
7. PR #468 é squash-merged;
8. o SHA mergeado é promovido de forma controlada na Vercel;
9. produção é validada sem fallback sintético e sem timeout serverless;
10. automações são reativadas gradualmente, observando IO e erros antes de ampliar a carga.
