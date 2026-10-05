# Matriz de status funcional

| Área | Status | Observação |
| --- | --- | --- |
| Auth | Real | Neon Managed Auth com `/auth/register`, `/auth/login`, `/auth/session`, `/auth/logout` e `/auth/me`; sessão via cookie HttpOnly first-party + JWT curto verificado por JWKS/Ed25519; novos cadastros ficam pendentes até aprovação. |
| Search Profiles | Real/Parcial | Lista e persistência reais em `search_profiles` + `search_profile_filters`; busca/orquestração ainda parcial. |
| Companies | Real | Lista, detalhe, qualification, patterns, thesis, market map e ranking saem do backend com Neon Postgres como fonte primária. |
| Dashboard | Real | KPI strip, top leads e sumários consolidados sobre snapshots persistidos. |
| Monitoring | Real/Parcial | BrasilAPI, RSS públicos e website monitoring gravam outputs/sinais reais; health/orquestração avançada seguem parciais. |
| Sources | Real | `source_catalog` seedado e lido do backend com status explícito por fonte. |
| Agents | Real/Parcial | Qualification, patterns e lead score estão reais; backlog/health avançado seguem simplificados. |
| Database | Real | DDL canônico sincronizado no Neon; produção é migration-managed e não recebe bootstrap de dados demo. |
| Frontend fallback | Parcial | Dashboard/companies/detail/search profiles/monitoring/agents/pipeline usam backend real; fallback mock permanece apenas em quick actions. |

| ABM War Room | Real/Parcial | Camada comercial operacional adicionada com stakeholders, touchpoints, objeções, momentum/priority e briefing; evolução de governança/completude segue parcial. |
| Connector Observability | Real/Parcial | `GET /sources/usage/mais-retorno` expõe quota governada com status derivado do modo (`neon` → real, `memory` → partial); card correspondente em `/sources`. Persistência real da quota depende do Neon configurado. |
| Capture Diagnostics | Real | `/api/data-capture/health` exige `Bearer CRON_SECRET`; disponibilidade pública mínima permanece em `/api/health`. Smoke cobre 401 sem credencial e diagnóstico completo autenticado. |
