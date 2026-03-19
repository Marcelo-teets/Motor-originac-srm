# Arquitetura consolidada

## Visão geral
A consolidação organiza a plataforma em dois subprojetos independentes e integráveis:

- `backend/`: API FastAPI com camadas de rotas, serviços, repositórios em memória e modelos de domínio.
- `frontend/`: aplicação React/Vite com páginas de dashboard, fontes e empresas integradas à API.
- `docs/`: documentação arquitetural, de API e roadmap.
- `scripts/`: atalhos de execução local e testes.

## Backend
- `app/api/`: rotas HTTP finas e dependências.
- `app/services/`: orquestração do domínio de originação.
- `app/repositories/`: persistência em memória preparada para troca futura.
- `app/domain/`: contratos e regras transversais.

## Frontend
- `src/pages/`: telas com foco em fluxo.
- `src/components/`: layout e estados reutilizáveis.
- `src/lib/api.js`: client HTTP centralizado com tratamento simples de erro.

## Comunicação
O frontend consome diretamente a API em `VITE_API_BASE_URL`, com fallback para `http://localhost:8000/api/v1`.

## Limites desta fase
- Persistência ainda é in-memory.
- Não há autenticação.
- Copilot e ranking avançado permanecem como próximos passos, não como funcionalidades fechadas.
