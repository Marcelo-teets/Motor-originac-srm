# Matriz de status funcional

| Área | Status | Observação |
| --- | --- | --- |
| Auth | Real | `/auth/login`, `/auth/logout` e `/auth/me` agora usam Supabase Auth real com JWT validado no backend. |
| Search Profiles | Real/Parcial | Lista e persistência reais em `search_profiles` + `search_profile_filters`; busca/orquestração ainda parcial. |
| Companies | Real | Lista, detalhe, qualification, patterns, thesis, market map e ranking saem do backend com Supabase como fonte primária. |
| Dashboard | Real | KPI strip, top leads e sumários consolidados sobre snapshots persistidos. |
| Monitoring | Real/Parcial | BrasilAPI, RSS públicos e website monitoring gravam outputs/sinais reais; health/orquestração avançada seguem parciais. |
| Sources | Real | `source_catalog` seedado e lido do backend com status explícito por fonte. |
| Agents | Real/Parcial | Qualification, patterns e lead score estão reais; backlog/health avançado seguem simplificados. |
| Database | Real | DDL canônico sincronizado, seeds úteis e bootstrap em Supabase. |
| Frontend fallback | Parcial | Dashboard/companies/detail/search profiles usam backend real; monitoring/agents/pipeline ainda possuem fallback controlado. |

| ABM War Room | Real/Parcial | Camada comercial operacional adicionada com stakeholders, touchpoints, objeções, momentum/priority e briefing; evolução de governança/completude segue parcial. |
