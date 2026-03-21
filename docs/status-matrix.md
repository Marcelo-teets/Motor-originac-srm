# Matriz de status funcional

| Área | Status | Observação |
| --- | --- | --- |
| Auth | Mock | `/auth/login`, `/auth/logout`, `/auth/me` continuam demo. |
| Search Profiles | Real/Parcial | Persistência preparada para Supabase; sem UI mutável real nesta PR. |
| Companies | Real | Lista, detalhe, qualification, thesis, market map e ranking dinâmico. |
| Dashboard | Real | KPI strip, top leads, widgets de monitoring/agentes/patterns/pipeline e charts simples. |
| Monitoring | Parcial | Connectors reais iniciais + fallback centralizado. |
| Sources | Real/Parcial | Catálogo seedado com status explícito por fonte. |
| Agents | Real | Qualification, patterns e lead score implementados sobre a arquitetura oficial. |
| Database | Real | DDL canônico atualizado, migrations sincronizadas e seeds iniciais. |
| Frontend fallback | Mock | `frontend/src/mocks` ainda preenche a UX quando backend real não estiver conectado. |
