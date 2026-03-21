# Matriz de status funcional

| Área | Status | Observação |
| --- | --- | --- |
| Auth | Mock | `/auth/login`, `/auth/logout`, `/auth/me` retornam sessão demo. |
| Search Profiles | Parcial | CRUD e run implementados em memória; builder disponível no frontend. |
| Companies | Real | Lista, detalhe, scores, qualification, thesis e ranking expostos. |
| Dashboard | Real | Resumo, top leads, agentes, padrões e pipeline executivo. |
| Monitoring | Parcial | Endpoints e telas prontas com payload estático rastreável. |
| Sources | Parcial | Catálogo com status real/parcial/mock por fonte. |
| Agents | Real | Definições, runs, validações e health com contrato padronizado. |
| Database | Real | DDL canônico e migration inicial unificados. |
| Frontend fallback | Mock | `frontend/src/mocks` garante telas preenchidas. |
