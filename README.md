# Motor Originação SRM

Plataforma consolidada para originação comercial com backend FastAPI e frontend React/Vite. Esta rodada reorganiza o repositório em uma base única, preparada para evoluir como produto completo.

## Estrutura
- `backend/`: API e testes.
- `frontend/`: aplicação web integrada à API.
- `docs/`: arquitetura, API e roadmap.
- `scripts/`: atalhos de execução local.

## Fluxos implementados
- Healthcheck do backend.
- Catálogo de fontes BR.
- Cadastro e listagem de empresas com deduplicação por CNPJ e nome normalizado.
- Registro e listagem de sinais.
- Score atual, histórico de score e thesis comercial.
- Market map agregado por setor.
- Dashboard e telas de operação consumindo endpoints reais.

## Rodando localmente
### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Defina `VITE_API_BASE_URL` se o backend não estiver em `http://localhost:8000/api/v1`.

## Testes
```bash
cd backend
pytest
```

## Endpoints principais
Veja `docs/api.md`.

## Limitações atuais
- Persistência em memória.
- Sem autenticação.
- Sem integrações externas automatizadas.

## Próximos passos
Veja `docs/roadmap.md`.
